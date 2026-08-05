export function resolvePlanningLockState(tasks, baselineResult) {
    if (baselineResult?.success && baselineResult.data) return true;
    if (baselineResult?.data === null) return false;
    return (tasks || []).some(task => Boolean(task.is_baseline_locked));
}
