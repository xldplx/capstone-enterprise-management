/**
 * budgetController.js
 * CRUD untuk tabel public.budget + fitur sync actual dari tasks
 *
 * Kolom tabel budget:
 *   id, project_id, category, type (CAPEX|OPEX), planned, actual,
 *   wbs_id (nullable FK ke wbs), created_at, updated_at
 *
 * Routes (sesuai Budget.jsx & server.js):
 *   GET    /api/budget?project_id=:id       → getBudgetByProject
 *   POST   /api/budget                      → createBudgetCategory
 *   PUT    /api/budget/:id                  → updateBudgetCategory
 *   DELETE /api/budget/:id                  → deleteBudgetCategory
 *   PATCH  /api/budget/:id/sync             → syncActualFromTasks  (per-row)
 *   PATCH  /api/budget/sync-all?project_id= → syncAllActuals       (semua row project)
 *
 * ⚠  PENTING di server.js: daftarkan /budget/sync-all SEBELUM /budget/:id
 *    agar Express tidak salah parsing "sync-all" sebagai ":id".
 *
 * Logic sync:
 *   - Jika baris punya wbs_id → sum actual_cost tasks yang wbs_code-nya
 *     dimulai dengan prefix wbs_code dari node tersebut
 *   - Jika tidak punya wbs_id → sum SEMUA actual_cost tasks di project
 *   - Frontend juga menampilkan res.synced_count (sync-all) dan
 *     res.synced_actual (per-row), jadi pastikan field itu ada
 */

const supabase       = require('../config/db');
const { writeAudit } = require('./auditController');

// ── GET /api/budget?project_id=:id ───────────────────────────────────────────
const getBudgetByProject = async (req, res) => {
    try {
        const { project_id } = req.query;
        let query = supabase
            .from('budget')
            // join ke wbs untuk dapat wbs_code & name (dipakai di Budget.jsx kolom WBS)
            .select('*, wbs(id, wbs_code, name)')
            .order('created_at', { ascending: true });

        if (project_id) query = query.eq('project_id', parseInt(project_id));

        const { data, error } = await query;
        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── POST /api/budget ──────────────────────────────────────────────────────────
const createBudgetCategory = async (req, res) => {
    const { category, type, planned, actual, project_id, wbs_id, responsible_person, cost_center } = req.body;

    if (!category || !String(category).trim())
        return res.status(400).json({ success: false, message: 'category is required.' });
    if (!project_id)
        return res.status(400).json({ success: false, message: 'project_id is required.' });
    if (!['CAPEX', 'OPEX'].includes(type))
        return res.status(400).json({ success: false, message: 'type must be CAPEX or OPEX.' });

    const plannedNum = parseFloat(planned);
    if (isNaN(plannedNum) || plannedNum < 0)
        return res.status(400).json({ success: false, message: 'planned must be >= 0.' });

    try {
        const { data, error } = await supabase
            .from('budget')
            .insert([{
                category:           String(category).trim(),
                type,
                planned:            plannedNum,
                actual:             actual != null ? parseFloat(actual) : 0,
                project_id:         parseInt(project_id),
                wbs_id:             wbs_id ? parseInt(wbs_id) : null,
                responsible_person: responsible_person ? String(responsible_person).trim() : null,
                cost_center:        cost_center ? String(cost_center).trim() : null,
            }])
            .select('*, wbs(id, wbs_code, name)')
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });

        await writeAudit(req, 'CREATE', 'budget', data.id, {
            category: data.category, type, project_id, responsible_person: data.responsible_person, cost_center: data.cost_center,
        });
        res.status(201).json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── PUT /api/budget/:id ───────────────────────────────────────────────────────
const updateBudgetCategory = async (req, res) => {
    const { id } = req.params;
    const { category, type, planned, actual, wbs_id, responsible_person, cost_center } = req.body;

    if (!category || !String(category).trim())
        return res.status(400).json({ success: false, message: 'category is required.' });

    try {
        const updates = {
            category:           String(category).trim(),
            type:               ['CAPEX', 'OPEX'].includes(type) ? type : 'CAPEX',
            updated_at:         new Date().toISOString(),
            wbs_id:             wbs_id ? parseInt(wbs_id) : null,
            responsible_person: responsible_person != null ? (String(responsible_person).trim() || null) : null,
            cost_center:        cost_center != null ? (String(cost_center).trim() || null) : null,
        };

        if (planned != null) updates.planned = parseFloat(planned);
        if (actual  != null) updates.actual  = parseFloat(actual);

        const { data, error } = await supabase
            .from('budget')
            .update(updates)
            .eq('id', id)
            .select('*, wbs(id, wbs_code, name)')
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });
        if (!data)  return res.status(404).json({ success: false, message: 'Budget category not found.' });

        await writeAudit(req, 'UPDATE', 'budget', id, { category: data.category, responsible_person: data.responsible_person });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── DELETE /api/budget/:id ────────────────────────────────────────────────────
const deleteBudgetCategory = async (req, res) => {
    const { id } = req.params;
    try {
        const { data: existing } = await supabase
            .from('budget')
            .select('category')
            .eq('id', id)
            .single();

        const { error } = await supabase
            .from('budget')
            .delete()
            .eq('id', id);

        if (error) return res.status(500).json({ success: false, message: error.message });

        await writeAudit(req, 'DELETE', 'budget', id, { category: existing?.category });
        res.json({ success: true, message: 'Budget category deleted.' });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── Helper: hitung total actual_cost tasks untuk sebuah budget row ────────────
async function computeActualForRow(budgetRow, allTasks) {
    // Jika ada wbs_id, cari prefix wbs_code-nya lalu filter tasks
    if (budgetRow.wbs_id) {
        const { data: wbsNode } = await supabase
            .from('wbs')
            .select('wbs_code')
            .eq('id', budgetRow.wbs_id)
            .single();

        if (wbsNode && wbsNode.wbs_code) {
            const prefix = wbsNode.wbs_code;
            // Boundary-safe prefix match: '1.1' must not also capture '1.10'.
            // Count the node itself and its dotted descendants only.
            const filtered = allTasks.filter(
                t => t.wbs_code && (t.wbs_code === prefix || t.wbs_code.startsWith(prefix + '.'))
            );
            return filtered.reduce((s, t) => s + parseFloat(t.actual_cost || 0), 0);
        }
    }

    // Tidak ada wbs_id → sum semua tasks project
    return allTasks.reduce((s, t) => s + parseFloat(t.actual_cost || 0), 0);
}

// ── PATCH /api/budget/:id/sync ─────────────────────────────────────────────────
// Sync actual untuk satu budget row dari tasks
// Response: { success, data, synced_actual }
// Budget.jsx: showToast(`Synced actual ${formatCurrency(res.synced_actual)}`)
const syncActualFromTasks = async (req, res) => {
    const { id } = req.params;
    try {
        // Ambil budget row
        const { data: budgetRow, error: bErr } = await supabase
            .from('budget')
            .select('*')
            .eq('id', id)
            .single();

        if (bErr || !budgetRow)
            return res.status(404).json({ success: false, message: 'Budget category not found.' });

        // Ambil semua tasks project
        const { data: tasks, error: tErr } = await supabase
            .from('tasks')
            .select('actual_cost, wbs_code')
            .eq('project_id', budgetRow.project_id);

        if (tErr) return res.status(500).json({ success: false, message: tErr.message });

        const syncedActual = await computeActualForRow(budgetRow, tasks || []);

        // Update actual
        const { data: updated, error: uErr } = await supabase
            .from('budget')
            .update({ actual: syncedActual, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*, wbs(id, wbs_code, name)')
            .single();

        if (uErr) return res.status(500).json({ success: false, message: uErr.message });

        await writeAudit(req, 'SYNC', 'budget', id, {
            category:      budgetRow.category,
            synced_actual: syncedActual,
        });

        res.json({ success: true, data: updated, synced_actual: syncedActual });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

// ── PATCH /api/budget/sync-all?project_id=:id ─────────────────────────────────
// Sync actual untuk SEMUA budget rows di project
// Response: { success, data, synced_count, message }
// Budget.jsx: showToast(`${res.synced_count} synced`)
const syncAllActuals = async (req, res) => {
    const { project_id } = req.query;
    if (!project_id)
        return res.status(400).json({ success: false, message: 'project_id query param is required.' });

    try {
        // Ambil semua budget rows project
        const { data: budgetRows, error: bErr } = await supabase
            .from('budget')
            .select('*')
            .eq('project_id', parseInt(project_id));

        if (bErr) return res.status(500).json({ success: false, message: bErr.message });
        if (!budgetRows || budgetRows.length === 0)
            return res.json({ success: true, data: [], synced_count: 0, message: 'No budget categories to sync.' });

        // Ambil semua tasks project (sekali saja, reuse untuk semua rows)
        const { data: tasks, error: tErr } = await supabase
            .from('tasks')
            .select('actual_cost, wbs_code')
            .eq('project_id', parseInt(project_id));

        if (tErr) return res.status(500).json({ success: false, message: tErr.message });

        const allTasks = tasks || [];

        // Update setiap row
        const updatedRows = await Promise.all(
            budgetRows.map(async (row) => {
                const syncedActual = await computeActualForRow(row, allTasks);
                const { data } = await supabase
                    .from('budget')
                    .update({ actual: syncedActual, updated_at: new Date().toISOString() })
                    .eq('id', row.id)
                    .select('*, wbs(id, wbs_code, name)')
                    .single();
                return data;
            })
        );

        const successful = updatedRows.filter(Boolean);

        await writeAudit(req, 'SYNC', 'budget', null, {
            project_id,
            synced_count: successful.length,
        });

        res.json({
            success:      true,
            data:         successful,
            synced_count: successful.length,
            message:      `${successful.length} budget categories synced from tasks.`,
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getBudgetByProject,
    createBudgetCategory,
    updateBudgetCategory,
    deleteBudgetCategory,
    syncActualFromTasks,
    syncAllActuals,
};