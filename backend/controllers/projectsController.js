const supabase = require('../config/db');
const { writeAudit } = require('./auditController');
const { requirePlanningUnlocked } = require('../services/planningLockService');

const getAllProjects = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (error) return res.status(500).json({ success: false, message: error.message });
        res.json({ success: true, data: data || [] });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const getProjectById = async (req, res) => {
    try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
        if (error) return res.status(404).json({ success: false, message: 'Project not found.' });
        res.json({ success: true, data });
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

module.exports = { getAllProjects, getProjectById, createProject, updateProject, deleteProject };
