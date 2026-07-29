const supabase = require('../config/db');
const {
    evaluatePlanReadiness,
} = require('../services/planningReadinessService');
const { previewDependencyRemedy } = require('../services/dependencyPreviewService');

async function loadPlanningData(projectId) {
    const numericProjectId = parseInt(projectId);
    if (Number.isNaN(numericProjectId)) {
        const error = new Error('Valid projectId is required.');
        error.statusCode = 400;
        throw error;
    }

    const [projectResult, wbsResult, tasksResult] = await Promise.all([
        supabase.from('projects').select('*').eq('id', numericProjectId).single(),
        supabase.from('wbs').select('*').eq('project_id', numericProjectId).order('wbs_code'),
        supabase.from('tasks').select('*').eq('project_id', numericProjectId).order('wbs_code'),
    ]);

    if (projectResult.error || !projectResult.data) {
        const error = new Error('Project not found.');
        error.statusCode = 404;
        throw error;
    }
    if (wbsResult.error) throw wbsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    return {
        project: projectResult.data,
        wbsNodes: wbsResult.data || [],
        tasks: tasksResult.data || [],
    };
}

function sendError(res, error) {
    res.status(error.statusCode || 500).json({
        success: false,
        code: error.code || 'READINESS_ERROR',
        message: error.message,
    });
}

const getPlanningReadiness = async (req, res) => {
    try {
        const { project, wbsNodes, tasks } = await loadPlanningData(req.params.projectId);
        res.json({ success: true, data: evaluatePlanReadiness(project, wbsNodes, tasks) });
    } catch (error) {
        sendError(res, error);
    }
};

const previewDependency = async (req, res) => {
    try {
        const { project, wbsNodes, tasks } = await loadPlanningData(req.params.projectId);
        res.json({ success: true, data: previewDependencyRemedy(project, wbsNodes, tasks, req.body || {}) });
    } catch (error) {
        sendError(res, error);
    }
};

module.exports = { getPlanningReadiness, previewDependency, loadPlanningData };
