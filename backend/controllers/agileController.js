/**
 * agileController.js
 *
 * Read endpoints backing the Agile page. Sprints, board state, points, assignee
 * and completion are real columns now, so this controller reads them and hands
 * them to agileService for the metrics that stay computed — burndown, velocity
 * and capacity, none of which need a snapshot table.
 *
 * Writes live elsewhere on purpose: sprint lifecycle in sprintsController, board
 * moves in tasksController.updateTaskAgile, and progress in dailyActualsController.
 *
 * Routes (see server.js):
 *   GET /api/projects/:projectId/agile/overview          → getAgileOverview
 *   GET /api/projects/:projectId/agile/sprints/:sprintId → getSprintDetail
 */

const supabase = require('../config/db');
const agile    = require('../services/agileService');

// PostgREST caps a single response (Supabase ships a db-max-rows default), so a
// plain select silently truncates instead of erroring. daily_actuals grows by a
// row per task per reporting day, so a mid-sized project passes that cap within
// a couple of months — and a truncated ledger would draw a burndown that quietly
// understates progress. Page until a short page comes back.
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // 50k rows is far past anything this app produces

async function fetchAllRows(buildQuery) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE;
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return rows;
}

const TASK_COLUMNS = [
    'id', 'task_name', 'wbs_code', 'wbs_id', 'planned_start', 'planned_end',
    'planned_cost', 'planned_hours', 'actual_hours', 'weight', 'pct_complete',
    'sprint_id', 'board_status', 'story_points', 'assignee_id', 'blocked_reason', 'completed_at',
].join(', ');

/** One round trip for everything the page derives from. */
async function loadProjectAgileData(projectId) {
    const [projectResult, sprints, tasks, wbsNodes, dailyActuals, personnelResult] = await Promise.all([
        supabase.from('projects')
            .select('id, project_name, project_code, planned_start, planned_end, product_goal, definition_of_done')
            .eq('id', projectId).single(),
        fetchAllRows(() => supabase.from('sprints').select('*').eq('project_id', projectId).order('sprint_number')),
        fetchAllRows(() => supabase.from('tasks').select(TASK_COLUMNS).eq('project_id', projectId).order('wbs_code')),
        fetchAllRows(() => supabase.from('wbs').select('id, wbs_code, name, parent_id, level').eq('project_id', projectId).order('wbs_code')),
        fetchAllRows(() => supabase.from('daily_actuals')
            .select('task_id, entry_date, pct_complete')
            .eq('project_id', projectId)
            // range() needs a stable sort or a row can be paged twice or missed.
            .order('entry_date').order('task_id')),
        supabase.from('personnel').select('id, full_name, designation, status').eq('project_id', projectId),
    ]);

    if (projectResult.error || !projectResult.data) {
        const error = new Error('Project not found.');
        error.statusCode = 404;
        throw error;
    }

    return {
        project: projectResult.data,
        sprints, tasks, wbsNodes, dailyActuals,
        // Personnel only drives capacity and assignee names; a failure there
        // should not take the whole board down with it.
        personnel: personnelResult.error ? [] : (personnelResult.data || []),
    };
}

// ── GET /api/projects/:projectId/agile/overview ───────────────────────────────
const getAgileOverview = async (req, res) => {
    try {
        const data = await loadProjectAgileData(req.params.projectId);
        res.json({
            success: true,
            data: {
                project:   data.project,
                personnel: data.personnel.filter(person => (person.status ?? 'active') === 'active'),
                ...agile.buildOverview(data),
            },
        });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── GET /api/projects/:projectId/agile/sprints/:sprintId ──────────────────────
const getSprintDetail = async (req, res) => {
    const sprintId = Number(req.params.sprintId);
    if (!Number.isInteger(sprintId) || sprintId < 1)
        return res.status(400).json({ success: false, code: 'INVALID_SPRINT', message: 'Sprint id must be a positive whole number.' });

    try {
        const data   = await loadProjectAgileData(req.params.projectId);
        const sprint = data.sprints.find(candidate => candidate.id === sprintId);

        if (!sprint)
            return res.status(404).json({ success: false, code: 'SPRINT_NOT_FOUND', message: 'That sprint does not belong to this project.' });

        res.json({ success: true, data: agile.buildSprintDetail({ ...data, sprint }) });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

module.exports = { getAgileOverview, getSprintDetail };
