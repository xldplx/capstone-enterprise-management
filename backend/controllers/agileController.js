/**
 * agileController.js
 *
 * Read-only endpoints backing the Agile page. Correction #3 adds Agile without
 * a schema change, so there is nothing here to create or update: every sprint,
 * board column, story point and burndown point is derived by agileService from
 * rows that already exist.
 *
 * Card movement deliberately has no endpoint of its own. Moving a card forward
 * is progress, and progress is already recorded by
 * POST /api/projects/:projectId/daily-actuals; correcting a card backwards is
 * PUT /api/tasks/:id. Reusing those keeps the board, the ledger and EVM in
 * agreement and leaves the existing audit trail intact.
 *
 * Routes (see server.js):
 *   GET /api/projects/:projectId/agile/overview            → getAgileOverview
 *   GET /api/projects/:projectId/agile/sprints/:sprintNumber → getSprintDetail
 *
 * Both accept ?cadence=<days> (default 14) — the sprint length is a lens over
 * the project window, not stored state.
 */

const supabase = require('../config/db');
const agile    = require('../services/agileService');

const MAX_CADENCE_DAYS = 90;

function parseCadence(value) {
    if (value === undefined || value === null || value === '') return agile.DEFAULT_CADENCE_DAYS;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_CADENCE_DAYS) return NaN;
    return Math.floor(parsed);
}

/**
 * One round trip for everything the page derives from.
 *
 * daily_actuals is fetched with only the three columns the burndown reads —
 * the table grows by a row per task per reporting day, and pulling photo_url
 * and the rest of it back for a whole project would dwarf the payload it feeds.
 */
async function loadProjectAgileData(projectId) {
    const [projectResult, tasksResult, actualsResult, personnelResult] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('tasks')
            .select('id, task_name, wbs_code, planned_start, planned_end, planned_cost, planned_hours, actual_hours, weight, pct_complete')
            .eq('project_id', projectId)
            .order('wbs_code'),
        supabase.from('daily_actuals')
            .select('task_id, entry_date, pct_complete')
            .eq('project_id', projectId),
        supabase.from('personnel').select('id, status').eq('project_id', projectId),
    ]);

    if (projectResult.error || !projectResult.data) {
        const error = new Error('Project not found.');
        error.statusCode = 404;
        throw error;
    }
    if (tasksResult.error)   throw new Error(tasksResult.error.message);
    if (actualsResult.error) throw new Error(actualsResult.error.message);

    return {
        project:      projectResult.data,
        tasks:        tasksResult.data   || [],
        dailyActuals: actualsResult.data || [],
        // Personnel only drives the capacity hint; a failure there should not
        // take the whole board down with it.
        personnel:    personnelResult.error ? [] : (personnelResult.data || []),
    };
}

// ── GET /api/projects/:projectId/agile/overview ───────────────────────────────
const getAgileOverview = async (req, res) => {
    const cadenceDays = parseCadence(req.query.cadence);
    if (Number.isNaN(cadenceDays)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_CADENCE',
            message: `Sprint length must be between 1 and ${MAX_CADENCE_DAYS} days.`,
        });
    }

    try {
        const data = await loadProjectAgileData(req.params.projectId);

        // Without a planned window there is nothing to tile sprints across.
        // Say so explicitly — an empty board with no explanation reads as a bug.
        if (!data.project.planned_start || !data.project.planned_end) {
            return res.json({
                success: true,
                code: 'NO_PROJECT_WINDOW',
                message: 'Set the project planned start and end dates to generate sprints.',
                data: agile.buildOverview({ ...data, cadenceDays }),
            });
        }

        res.json({ success: true, data: agile.buildOverview({ ...data, cadenceDays }) });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

// ── GET /api/projects/:projectId/agile/sprints/:sprintNumber ──────────────────
const getSprintDetail = async (req, res) => {
    const cadenceDays = parseCadence(req.query.cadence);
    if (Number.isNaN(cadenceDays)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_CADENCE',
            message: `Sprint length must be between 1 and ${MAX_CADENCE_DAYS} days.`,
        });
    }

    const sprintNumber = Number(req.params.sprintNumber);
    if (!Number.isInteger(sprintNumber) || sprintNumber < 1) {
        return res.status(400).json({ success: false, code: 'INVALID_SPRINT', message: 'Sprint number must be a positive whole number.' });
    }

    try {
        const data   = await loadProjectAgileData(req.params.projectId);
        const detail = agile.buildSprintDetail({ ...data, sprintNumber, cadenceDays });

        if (!detail) {
            return res.status(404).json({
                success: false,
                code: 'SPRINT_OUT_OF_RANGE',
                message: 'That sprint falls outside the project window.',
            });
        }

        res.json({ success: true, data: detail });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

module.exports = { getAgileOverview, getSprintDetail };
