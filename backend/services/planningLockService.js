const supabase = require('../config/db');

async function isProjectPlanningLocked(projectId) {
    const { data, error } = await supabase
        .from('baselines')
        .select('project_id')
        .eq('project_id', parseInt(projectId))
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}

async function requirePlanningUnlocked(projectId) {
    if (await isProjectPlanningLocked(projectId)) {
        const error = new Error('Planning data is locked by the active baseline. Actual progress can still be updated.');
        error.statusCode = 409;
        error.code = 'BASELINE_LOCKED';
        throw error;
    }
}

module.exports = { isProjectPlanningLocked, requirePlanningUnlocked };
