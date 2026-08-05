const supabase = require('../config/db');
const { writeAudit } = require('./auditController');
const { requirePlanningUnlocked } = require('../services/planningLockService');
const { parseUtcDay } = require('../services/planningReadinessService');

// ── Planned Value ─────────────────────────────────────────────────────────────
// Consumers compute PV as BAC x project.schedule_pct. Nothing ever wrote that
// column after creation, so it stayed 0 and SPI (EV/PV) was null everywhere.
//
// Derive it instead, time-phased off the task baseline the way EVM defines PV:
// planned % complete is the planned-cost-weighted share of each task's elapsed
// duration, not a straight line across the project. A task with no dates has no
// planned value yet and contributes 0.
//
// `today` is a UTC-day timestamp. Everything here goes through parseUtcDay so
// dates are compared on the same footing — mixing local midnight with a
// UTC-parsed "2026-01-01" silently skews every fraction by the UTC offset.
function schedulePctFromTasks(tasks, today) {
    let planned = 0;
    let earnedByPlan = 0;

    for (const task of tasks) {
        const cost = parseFloat(task.planned_cost) || 0;
        if (cost <= 0) continue;
        planned += cost;

        const start = parseUtcDay(task.planned_start);
        const end   = parseUtcDay(task.planned_end);
        if (start == null || end == null) continue;

        const span = end - start;
        const fraction = span <= 0
            ? (today >= end ? 1 : 0)
            : Math.min(1, Math.max(0, (today - start) / span));
        earnedByPlan += cost * fraction;
    }

    if (planned <= 0) return null;
    return parseFloat((earnedByPlan / planned).toFixed(4));
}

function utcToday() {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now).map(part => [part.type, part.value]));
    return parseUtcDay(`${parts.year}-${parts.month}-${parts.day}`);
}

function parseSchedulePctInput(value) {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : NaN;
}

// Fill in schedule_pct only when the column has nothing usable. A value that was
// set deliberately (seeded, or entered through the API) stays authoritative --
// silently replacing it would move CPI/SPI on projects that were already
// reporting correctly. Projects created through the UI never receive one, so
// they arrive as 0 and get the derived value.
function withSchedulePct(project, tasks) {
    const stored = parseFloat(project.schedule_pct);
    if (Number.isFinite(stored) && stored > 0) return project;

    const derived = schedulePctFromTasks(tasks, utcToday());
    return derived === null
        ? project
        : { ...project, schedule_pct: derived };
}

function withBudgetAndSchedule(project, tasks = [], budgetItems = []) {
    const projectWithSchedule = withSchedulePct(project, tasks);
    const totalBudget = parseFloat(project.total_budget || 0);
    const allocatedBudget = budgetItems.reduce((acc, item) => acc + (parseFloat(item.planned) || 0), 0);
    const remainingBudget = totalBudget - allocatedBudget;

    return {
        ...projectWithSchedule,
        allocated_budget: allocatedBudget,
        remaining_budget: remainingBudget,
    };
}

const getAllProjects = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, message: error.message });

        const projects = data || [];
        if (projects.length === 0) return res.json({ success: true, data: [] });

        const projectIds = projects.map(project => project.id);

        const [{ data: tasks }, { data: budgetItems }] = await Promise.all([
            supabase.from('tasks').select('project_id, planned_cost, planned_start, planned_end').in('project_id', projectIds),
            supabase.from('budget').select('project_id, planned').in('project_id', projectIds),
        ]);

        const tasksByProject = new Map();
        for (const task of tasks || []) {
            const list = tasksByProject.get(task.project_id) || [];
            list.push(task);
            tasksByProject.set(task.project_id, list);
        }

        const budgetByProject = new Map();
        for (const item of budgetItems || []) {
            const list = budgetByProject.get(item.project_id) || [];
            list.push(item);
            budgetByProject.set(item.project_id, list);
        }

        res.json({
            success: true,
            data: projects.map(project => withBudgetAndSchedule(
                project,
                tasksByProject.get(project.id) || [],
                budgetByProject.get(project.id) || []
            )),
        });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const getProjectById = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
        if (error) return res.status(404).json({ success: false, message: 'Project not found.' });

        const [{ data: tasks }, { data: budgetItems }] = await Promise.all([
            supabase.from('tasks').select('planned_cost, planned_start, planned_end').eq('project_id', req.params.id),
            supabase.from('budget').select('planned').eq('project_id', req.params.id),
        ]);

        res.json({ success: true, data: withBudgetAndSchedule(data, tasks || [], budgetItems || []) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};


const createProject = async (req, res) => {
    const { project_name, project_code, description, planned_start, planned_end, total_budget, schedule_pct } = req.body;
    if (!project_name || !project_code)
        return res.status(400).json({ success: false, message: 'project_name and project_code are required.' });
    const normalizedSchedulePct = parseSchedulePctInput(schedule_pct);
    if (Number.isNaN(normalizedSchedulePct))
        return res.status(400).json({ success: false, code: 'INVALID_SCHEDULE_PCT', message: 'schedule_pct must be between 0 and 1.' });
    try {
        const { data, error } = await supabase.from('projects').insert([{
            project_name, project_code,
            description:   description   || null,
            planned_start: planned_start || null,
            planned_end:   planned_end   || null,
            total_budget:  parseFloat(total_budget)  || 0,
            schedule_pct:  normalizedSchedulePct,
            status: 'planning',
            created_by: req.user.username,
        }]).select().single();
        if (error) {
            if (error.code === '23505') return res.status(409).json({ success: false, message: 'Project code already exists.' });
            return res.status(500).json({ success: false, message: error.message });
        }
        await writeAudit(req, 'CREATE', 'project', data.id, { project_name: data.project_name });
        res.status(201).json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const updateProject = async (req, res) => {
    const updates = {};
    ['project_name','description','planned_start','planned_end','total_budget','status','schedule_pct']
        .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (req.body.schedule_pct !== undefined) {
        const normalizedSchedulePct = parseSchedulePctInput(req.body.schedule_pct);
        if (Number.isNaN(normalizedSchedulePct))
            return res.status(400).json({ success: false, code: 'INVALID_SCHEDULE_PCT', message: 'schedule_pct must be between 0 and 1.' });
        updates.schedule_pct = normalizedSchedulePct;
    }
    updates.updated_at = new Date().toISOString();
    try {
        const planningFields = ['planned_start', 'planned_end', 'total_budget', 'schedule_pct'];
        if (planningFields.some(field => req.body[field] !== undefined))
            await requirePlanningUnlocked(req.params.id);
        const { data, error } = await supabase.from('projects').update(updates).eq('id', req.params.id).select().single();
        if (error) return res.status(500).json({ success: false, message: error.message });
        await writeAudit(req, 'UPDATE', 'project', data.id, { project_name: data.project_name });
        res.json({ success: true, data });
    } catch (e) {
        res.status(e.statusCode || 500).json({ success: false, code: e.code, message: e.message });
    }
};

const deleteProject = async (req, res) => {
    try {
        const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ success: false, message: error.message });
        await writeAudit(req, 'DELETE', 'project', req.params.id, { project_name: `project_id_${req.params.id}` });
        res.json({ success: true, message: 'Project deleted.' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = {
    getAllProjects, getProjectById, createProject, updateProject, deleteProject,
    // exported for tests
    schedulePctFromTasks, withSchedulePct,
};
