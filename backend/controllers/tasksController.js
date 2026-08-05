/**
 * tasksController.js
 *
 * getTasksByProject kini auto-compute schedule_pct & float setiap request,
 * sehingga Report.jsx mendapat nilai real tanpa perlu endpoint terpisah.
 *
 * schedule_pct = % durasi yang seharusnya sudah selesai berdasarkan hari ini
 * float        = sisa hari ke planned_end (0 = critical/overdue, null = no schedule)
 */

const supabase = require('../config/db');
const { writeAudit } = require('./auditController');
const { evaluatePlanReadiness, parseUtcDay } = require('../services/planningReadinessService');
const { requirePlanningUnlocked } = require('../services/planningLockService');

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeSchedulePct(plannedStart, plannedEnd, today) {
    if (!plannedStart || !plannedEnd) return 0;
    const start   = parseUtcDay(plannedStart);
    const end     = parseUtcDay(plannedEnd);
    if (start == null || end == null) return 0;
    const total   = end - start;
    if (total <= 0) return 1;
    const elapsed = today - start;
    // Return 0-1 (desimal) sesuai presisi DB NUMERIC(5,4)
    return Math.min(1, Math.max(0, elapsed / total));
}

function computeFloat(plannedEnd, today) {
    if (!plannedEnd) return null;
    const end = parseUtcDay(plannedEnd);
    if (end == null) return null;
    const days = Math.floor((end - today) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
}

// Inject schedule_pct & float ke setiap task berdasarkan tanggal hari ini
function enrichTasks(tasks) {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const today = parseUtcDay(`${parts.year}-${parts.month}-${parts.day}`);

    return tasks.map(task => {
        // Gunakan nilai DB jika sudah up-to-date (di-set hari ini via PATCH),
        // kalau tidak ada hitung on-the-fly agar Report selalu dapat data real.
        const schedulePct = computeSchedulePct(task.planned_start, task.planned_end, today);
        const floatDays   = computeFloat(task.planned_end, today);

        return {
            ...task,
            schedule_pct: parseFloat(schedulePct.toFixed(4)),
            float:        floatDays,
        };
    });
}

// ── GET /api/projects/:projectId/tasks ────────────────────────────────────────
const getTasksByProject = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', req.params.projectId)
            .order('wbs_code');

        if (error) return res.status(500).json({ success: false, message: error.message });

        // Enrich dengan schedule_pct & float real-time
        const enriched = enrichTasks(data || []);
        res.json({ success: true, data: enriched });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── POST /api/projects/:projectId/tasks ───────────────────────────────────────
const createTask = async (req, res) => {
    const { projectId } = req.params;
    const {
        wbs_code, task_name, planned_start, planned_end,
        planned_duration, planned_cost, planned_hours, weight,
        predecessors, wbs_id,
    } = req.body;

    if (!task_name)
        return res.status(400).json({ success: false, message: 'task_name is required.' });

    try {
        await requirePlanningUnlocked(projectId);
        const { data, error } = await supabase.from('tasks').insert([{
            project_id:       parseInt(projectId),
            wbs_id:           wbs_id           ? parseInt(wbs_id) : null,
            wbs_code:         wbs_code         || null,
            task_name,
            planned_start:    planned_start    || null,
            planned_end:      planned_end      || null,
            planned_duration: planned_duration ? parseInt(planned_duration) : null,
            planned_cost:     parseFloat(planned_cost)  || 0,
            planned_hours:    parseFloat(planned_hours) || 0,
            weight:           parseFloat(weight)        || 0,
            predecessors:     predecessors || [],
            actual_cost: 0, actual_hours: 0, pct_complete: 0,
        }]).select().single();

        if (error) return res.status(500).json({ success: false, message: error.message });

        const [enriched] = enrichTasks([data]);
        res.status(201).json({ success: true, data: enriched });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── PUT /api/tasks/:id ────────────────────────────────────────────────────────
const updateTask = async (req, res) => {
    const planningFields = [
        'wbs_id', 'wbs_code', 'task_name', 'planned_start', 'planned_end',
        'planned_duration', 'planned_cost', 'planned_hours', 'weight', 'predecessors',
    ];
    const updates = {};
    [
        'wbs_id', 'wbs_code', 'task_name', 'planned_start', 'planned_end',
        'planned_duration', 'planned_cost', 'planned_hours', 'weight',
        'predecessors', 'actual_cost', 'actual_hours', 'pct_complete',
    ].forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    updates.updated_at = new Date().toISOString();

    try {
        if (planningFields.some(field => req.body[field] !== undefined)) {
            const { data: existing, error: findError } = await supabase
                .from('tasks').select('project_id').eq('id', req.params.id).single();
            if (findError || !existing)
                return res.status(404).json({ success: false, message: 'Task not found.' });
            await requirePlanningUnlocked(existing.project_id);
        }
        const { data, error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) return res.status(500).json({ success: false, message: error.message });

        const [enriched] = enrichTasks([data]);
        res.json({ success: true, data: enriched });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────
const deleteTask = async (req, res) => {
    try {
        const { data: existing, error: findError } = await supabase
            .from('tasks').select('project_id').eq('id', req.params.id).single();
        if (findError || !existing)
            return res.status(404).json({ success: false, message: 'Task not found.' });
        await requirePlanningUnlocked(existing.project_id);
        const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, message: 'Task deleted.' });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// Imported rows carry wbs_code (a human string), but readiness validates wbs_id.
// Resolve one to the other, or every imported task lands unlinked and trips the
// MISSING_WBS blocker, making the baseline permanently unlockable.
// Returns { idByCode, unknownCodes } — or { error } if the lookup itself failed.
async function resolveWbsIdsByCode(projectId, tasks) {
    const { data: wbsNodes, error } = await supabase
        .from('wbs').select('id, wbs_code').eq('project_id', parseInt(projectId));
    if (error) return { error };

    // Trim both sides: a node saved as "1.1 " must still match a sheet cell of "1.1".
    const idByCode = new Map((wbsNodes || [])
        .filter(node => node.wbs_code != null && String(node.wbs_code).trim() !== '')
        .map(node => [String(node.wbs_code).trim(), node.id]));

    const unknownCodes = [...new Set(tasks
        .map(task => String(task.wbs_code || '').trim())
        .filter(code => !idByCode.has(code)))];

    return { idByCode, unknownCodes };
}

// ── POST /api/projects/:projectId/tasks/import ────────────────────────────────
const bulkImportTasks = async (req, res) => {
    const { projectId } = req.params;
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0)
        return res.status(400).json({ success: false, message: 'tasks array is required.' });

    const invalidNameRows = tasks
        .map((task, index) => String(task?.task_name ?? '').trim() ? null : index + 1)
        .filter(rowNumber => rowNumber !== null);
    if (invalidNameRows.length) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_NAME',
            message: `Task Name is required on imported row${invalidNameRows.length === 1 ? '' : 's'} ${invalidNameRows.join(', ')}.`,
        });
    }

    try {
        await requirePlanningUnlocked(projectId);

        const { idByCode, unknownCodes, error: wbsError } = await resolveWbsIdsByCode(projectId, tasks);
        if (wbsError) return res.status(500).json({ success: false, message: wbsError.message });

        // Fail the whole import rather than silently inserting unlinked tasks.
        if (unknownCodes.length) {
            return res.status(400).json({
                success: false,
                code: 'UNKNOWN_WBS_CODE',
                message: `These WBS codes do not exist in this project: ${unknownCodes.map(code => code || '(blank)').join(', ')}. Create the WBS nodes first, or correct the spreadsheet.`,
            });
        }

        const rows = tasks.map(t => ({
            project_id:    parseInt(projectId),
            wbs_id:        idByCode.get(String(t.wbs_code || '').trim()),
            wbs_code:      t.wbs_code      || null,
            task_name:     String(t.task_name).trim(),
            planned_start: t.planned_start || null,
            planned_end:   t.planned_end   || null,
            planned_cost:  parseFloat(t.planned_cost)  || 0,
            planned_hours: parseFloat(t.planned_hours) || 0,
            weight:        parseFloat(t.weight)        || 0,
            predecessors:  t.predecessors  || [],
            actual_cost: 0, actual_hours: 0, pct_complete: 0,
        }));

        const { data, error } = await supabase.from('tasks').insert(rows).select();
        if (error) return res.status(500).json({ success: false, message: error.message });

        const enriched = enrichTasks(data || []);
        res.status(201).json({ success: true, imported: enriched.length, data: enriched });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── POST /api/projects/:projectId/tasks/baseline ──────────────────────────────
const lockBaseline = async (req, res) => {
    const { projectId } = req.params;
    const { baseline_name } = req.body;

    try {
        await requirePlanningUnlocked(projectId);

        const [projectResult, wbsResult, tasksResult] = await Promise.all([
            supabase.from('projects').select('*').eq('id', projectId).single(),
            supabase.from('wbs').select('*').eq('project_id', projectId),
            // Same ordering as planningReadinessController so the readiness the user
            // approved and the one that gates the lock are byte-identical.
            supabase.from('tasks').select('*').eq('project_id', projectId).order('wbs_code'),
        ]);

        if (projectResult.error || !projectResult.data)
            return res.status(404).json({ success: false, message: 'Project not found.' });
        if (wbsResult.error)
            return res.status(500).json({ success: false, message: wbsResult.error.message });
        if (tasksResult.error)
            return res.status(500).json({ success: false, message: tasksResult.error.message });

        const tasks = tasksResult.data || [];
        const readiness = evaluatePlanReadiness(projectResult.data, wbsResult.data || [], tasks);
        if (readiness.summary.blockers > 0) {
            return res.status(409).json({
                success: false,
                code: 'PLAN_NOT_READY',
                message: 'Resolve all planning blockers before locking the baseline.',
                data: readiness,
            });
        }

        // These three writes are not one transaction — supabase-js cannot open one.
        // The correct fix is a single plpgsql function called through rpc(), which
        // PostgREST wraps in a transaction; that needs a schema migration.
        // Until then, order matters: isProjectPlanningLocked() treats the mere
        // existence of a baselines row as "locked", so the baseline insert goes
        // LAST. If an earlier write fails there is no baseline row, the project
        // stays unlocked, and the PM can simply retry. Inserting first would leave
        // a project locked forever with no unlock route.
        const { error: tasksLockError } = await supabase.from('tasks')
            .update({ is_baseline_locked: true, updated_at: new Date().toISOString() })
            .eq('project_id', projectId);
        if (tasksLockError)
            return res.status(500).json({ success: false, message: tasksLockError.message });

        const { error: projectUpdateError } = await supabase.from('projects')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', projectId);
        if (projectUpdateError)
            return res.status(500).json({ success: false, message: projectUpdateError.message });

        const { error: baselineError } = await supabase.from('baselines').insert([{
            project_id:    parseInt(projectId),
            baseline_name: baseline_name || 'Baseline Rev.0',
            locked_by:     req.user.username,
            snapshot:      tasks,
        }]);
        if (baselineError)
            return res.status(500).json({ success: false, message: baselineError.message });

        const warningCodes = [...new Set(readiness.findings
            .filter(finding => finding.severity === 'warning')
            .map(finding => finding.code))];
        await writeAudit(req, 'LOCK', 'baseline', projectId, {
            baseline_name: baseline_name || 'Baseline Rev.0',
            task_count: tasks.length,
            readiness_state: readiness.state,
            accepted_warning_codes: warningCodes,
        });

        res.json({ success: true, message: 'Baseline locked.', task_count: tasks.length, readiness });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── GET /api/projects/:projectId/tasks/baseline ───────────────────────────────
const getBaselineInfo = async (req, res) => {
    const { projectId } = req.params;
    try {
        const { data, error } = await supabase
            .from('baselines')
            .select('baseline_name, locked_by, locked_at')
            .eq('project_id', projectId)
            .order('locked_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return res.json({ success: false, data: null });
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};

module.exports = {
    getTasksByProject,
    createTask,
    updateTask,
    deleteTask,
    bulkImportTasks,
    lockBaseline,
    getBaselineInfo,
};
