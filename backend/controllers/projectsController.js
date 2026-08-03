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
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Attach a derived schedule_pct without writing to the column.
function withSchedulePct(project, tasks) {
    const derived = schedulePctFromTasks(tasks, utcToday());
    return derived === null
        ? project
        : { ...project, schedule_pct: derived };
}

const getAllProjects = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, message: error.message });

        const projects = data || [];
        if (projects.length === 0) return res.json({ success: true, data: [] });

        // One extra query for the whole list, not one per project.
        const { data: tasks } = await supabase
            .from('tasks').select('project_id, planned_cost, planned_start, planned_end')
            .in('project_id', projects.map(project => project.id));

        const tasksByProject = new Map();
        for (const task of tasks || []) {
            const list = tasksByProject.get(task.project_id) || [];
            list.push(task);
            tasksByProject.set(task.project_id, list);
        }

        res.json({
            success: true,
            data: projects.map(project => withSchedulePct(project, tasksByProject.get(project.id) || [])),
        });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const getProjectById = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
        if (error) return res.status(404).json({ success: false, message: 'Project not found.' });

        const { data: tasks } = await supabase
            .from('tasks').select('planned_cost, planned_start, planned_end')
            .eq('project_id', req.params.id);

        res.json({ success: true, data: withSchedulePct(data, tasks || []) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createProject = async (req, res) => {
    const { project_name, project_code, description, planned_start, planned_end, total_budget, schedule_pct } = req.body;
    if (!project_name || !project_code)
        return res.status(400).json({ success: false, message: 'project_name and project_code are required.' });
    try {
        const { data, error } = await supabase.from('projects').insert([{
            project_name, project_code,
            description:   description   || null,
            planned_start: planned_start || null,
            planned_end:   planned_end   || null,
            total_budget:  parseFloat(total_budget)  || 0,
            schedule_pct:  parseFloat(schedule_pct)  || 0,
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
    updates.updated_at = new Date().toISOString();
    try {
        const planningFields = ['planned_start', 'planned_end', 'total_budget'];
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
    schedulePctFromTasks,
};
