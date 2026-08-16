/**
 * sprintsController.js
 * CRUD for public.sprints, plus the two lifecycle actions Scrum actually needs.
 *
 * Columns (added by hand in Supabase — see the agile schema notes):
 *   id, project_id, sprint_number, name, goal, start_date, end_date,
 *   status (planning|active|completed|cancelled), created_by, created_at, updated_at
 *
 * Routes (see server.js):
 *   GET    /api/projects/:projectId/sprints  → getSprintsByProject
 *   POST   /api/projects/:projectId/sprints  → createSprint
 *   PUT    /api/sprints/:id                  → updateSprint
 *   DELETE /api/sprints/:id                  → deleteSprint
 *   PATCH  /api/sprints/:id/start            → startSprint
 *   PATCH  /api/sprints/:id/complete         → completeSprint
 *
 * Sprint changes are deliberately NOT gated by requirePlanningUnlocked. A locked
 * baseline freezes the plan — dates, cost, weight — not the team's delivery
 * decisions. Committing a story to a sprint after the baseline is locked is
 * normal and correct.
 */

const supabase       = require('../config/db');
const { writeAudit } = require('./auditController');
const agile          = require('../services/agileService');

const sendError = (res, error) => res
    .status(error.statusCode || 500)
    .json({ success: false, code: error.code, message: error.message });

async function loadSprint(id) {
    const { data, error } = await supabase.from('sprints').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
        const notFound = new Error('Sprint not found.');
        notFound.statusCode = 404;
        throw notFound;
    }
    return data;
}

// ── GET /api/projects/:projectId/sprints ──────────────────────────────────────
const getSprintsByProject = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sprints').select('*')
            .eq('project_id', req.params.projectId)
            .order('sprint_number');
        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, data: data || [] });
    } catch (e) { sendError(res, e); }
};

// ── POST /api/projects/:projectId/sprints ─────────────────────────────────────
const createSprint = async (req, res) => {
    const { projectId } = req.params;
    try {
        const payload = agile.normalizeSprintPayload(req.body);

        const { data: existing, error: listError } = await supabase
            .from('sprints').select('*').eq('project_id', projectId);
        if (listError) return res.status(500).json({ success: false, message: listError.message });

        const clash = agile.findOverlappingSprint(payload, existing || []);
        if (clash) {
            return res.status(409).json({
                success: false,
                code: 'SPRINT_OVERLAP',
                message: `Those dates overlap ${clash.name} (${clash.start_date} to ${clash.end_date}). Sprints cannot run in parallel.`,
            });
        }

        // Number sprints sequentially per project; the unique index on
        // (project_id, sprint_number) is the real guard against a race.
        const nextNumber = Math.max(0, ...(existing || []).map(s => Number(s.sprint_number) || 0)) + 1;

        const { data, error } = await supabase.from('sprints').insert([{
            project_id:    parseInt(projectId),
            sprint_number: nextNumber,
            status:        'planning',
            created_by:    req.user.username,
            ...payload,
        }]).select().single();

        if (error) {
            if (error.code === '23505')
                return res.status(409).json({ success: false, code: 'SPRINT_DUPLICATE', message: 'That sprint number already exists. Try again.' });
            return res.status(500).json({ success: false, message: error.message });
        }

        await writeAudit(req, 'CREATE', 'sprint', data.id, { project_id: projectId, name: data.name, goal: data.goal });
        res.status(201).json({ success: true, data });
    } catch (e) { sendError(res, e); }
};

// ── PUT /api/sprints/:id ──────────────────────────────────────────────────────
const updateSprint = async (req, res) => {
    try {
        const sprint  = await loadSprint(req.params.id);
        const payload = agile.normalizeSprintPayload(req.body, { partial: true });

        if (payload.start_date || payload.end_date) {
            const { data: others, error: listError } = await supabase
                .from('sprints').select('*')
                .eq('project_id', sprint.project_id)
                .neq('id', sprint.id);
            if (listError) return res.status(500).json({ success: false, message: listError.message });

            const candidate = {
                start_date: payload.start_date ?? sprint.start_date,
                end_date:   payload.end_date   ?? sprint.end_date,
            };
            const clash = agile.findOverlappingSprint(candidate, others || []);
            if (clash) {
                return res.status(409).json({
                    success: false,
                    code: 'SPRINT_OVERLAP',
                    message: `Those dates overlap ${clash.name} (${clash.start_date} to ${clash.end_date}). Sprints cannot run in parallel.`,
                });
            }
        }

        const { data, error } = await supabase.from('sprints')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', sprint.id).select().single();
        if (error) return res.status(500).json({ success: false, message: error.message });

        await writeAudit(req, 'UPDATE', 'sprint', sprint.id, { name: data.name, goal: data.goal });
        res.json({ success: true, data });
    } catch (e) { sendError(res, e); }
};

// ── PATCH /api/sprints/:id/start ──────────────────────────────────────────────
const startSprint = async (req, res) => {
    try {
        const sprint = await loadSprint(req.params.id);
        if (sprint.status !== 'planning')
            return res.status(409).json({ success: false, code: 'SPRINT_NOT_PLANNING', message: `This sprint is already ${sprint.status}.` });

        const { data, error } = await supabase.from('sprints')
            .update({ status: 'active', updated_at: new Date().toISOString() })
            .eq('id', sprint.id).select().single();

        if (error) {
            // The partial unique index on (project_id) WHERE status='active' is
            // what stops a second board claiming to be current.
            if (error.code === '23505')
                return res.status(409).json({ success: false, code: 'SPRINT_ALREADY_ACTIVE', message: 'Another sprint on this project is already active. Complete it first.' });
            return res.status(500).json({ success: false, message: error.message });
        }

        // Committed stories that were never moved onto the board start in To Do.
        await supabase.from('tasks')
            .update({ board_status: 'todo', updated_at: new Date().toISOString() })
            .eq('sprint_id', sprint.id).eq('board_status', 'backlog');

        await writeAudit(req, 'START', 'sprint', sprint.id, { name: sprint.name });
        res.json({ success: true, data });
    } catch (e) { sendError(res, e); }
};

// ── PATCH /api/sprints/:id/complete ───────────────────────────────────────────
const completeSprint = async (req, res) => {
    try {
        const sprint = await loadSprint(req.params.id);
        if (sprint.status === 'completed')
            return res.status(409).json({ success: false, code: 'SPRINT_ALREADY_COMPLETE', message: 'This sprint is already completed.' });

        // Standard Scrum: unfinished stories return to the product backlog so the
        // next sprint can re-commit them deliberately, rather than inheriting
        // them silently. Their progress and completed_at are left untouched.
        const { data: carried, error: carryError } = await supabase.from('tasks')
            .update({ sprint_id: null, board_status: 'backlog', updated_at: new Date().toISOString() })
            .eq('sprint_id', sprint.id).neq('board_status', 'done')
            .select('id');
        if (carryError) return res.status(500).json({ success: false, message: carryError.message });

        const { data, error } = await supabase.from('sprints')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', sprint.id).select().single();
        if (error) return res.status(500).json({ success: false, message: error.message });

        const returned = (carried || []).length;
        await writeAudit(req, 'COMPLETE', 'sprint', sprint.id, { name: sprint.name, returned_to_backlog: returned });
        res.json({ success: true, data, returned_to_backlog: returned });
    } catch (e) { sendError(res, e); }
};

// ── DELETE /api/sprints/:id ───────────────────────────────────────────────────
const deleteSprint = async (req, res) => {
    try {
        const sprint = await loadSprint(req.params.id);

        // tasks.sprint_id is ON DELETE SET NULL, so stories survive — but they
        // would keep a board status with no board. Return them cleanly first.
        const { error: releaseError } = await supabase.from('tasks')
            .update({ sprint_id: null, board_status: 'backlog', updated_at: new Date().toISOString() })
            .eq('sprint_id', sprint.id);
        if (releaseError) return res.status(500).json({ success: false, message: releaseError.message });

        const { error } = await supabase.from('sprints').delete().eq('id', sprint.id);
        if (error) return res.status(500).json({ success: false, message: error.message });

        await writeAudit(req, 'DELETE', 'sprint', sprint.id, { name: sprint.name });
        res.json({ success: true, message: 'Sprint deleted. Its stories returned to the backlog.' });
    } catch (e) { sendError(res, e); }
};

module.exports = {
    getSprintsByProject, createSprint, updateSprint,
    startSprint, completeSprint, deleteSprint,
};
