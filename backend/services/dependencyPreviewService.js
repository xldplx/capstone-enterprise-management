const {
    evaluatePlanReadiness,
    parseUtcDay,
    __internal: {
        comparableId,
        daysBetween,
        findingIdentity,
        formatUtcDay,
        graphFor,
        keyOf,
        taskLabel,
    },
} = require('./planningReadinessService');

function latestTaskFinish(tasks) {
    const valid = tasks.map(task => parseUtcDay(task.planned_end)).filter(value => value != null);
    return valid.length ? Math.max(...valid) : null;
}

function reportSnapshot(report, project, tasks) {
    const finish = latestTaskFinish(tasks);
    const projectEnd = parseUtcDay(project.planned_end);
    return {
        state: report.state,
        summary: report.summary,
        projectedFinish: finish == null ? null : formatUtcDay(finish),
        projectEndVarianceDays: finish == null || projectEnd == null ? null : daysBetween(projectEnd, finish),
    };
}

function serviceError(message, statusCode = 400, code = 'INVALID_PREVIEW') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

function previewDependencyRemedy(project = {}, wbsNodes = [], sourceTasks = [], input = {}) {
    const { predecessorId, successorId, remedy } = input;
    if (!['shift_successor_chain', 'remove_dependency'].includes(remedy)) {
        throw serviceError('remedy must be shift_successor_chain or remove_dependency.');
    }

    const tasks = sourceTasks.map(task => ({
        ...task,
        predecessors: [...(Array.isArray(task.predecessors) ? task.predecessors : [])],
    }));
    const taskMap = new Map(tasks.map(task => [keyOf(task.id), task]));
    const predecessor = taskMap.get(keyOf(predecessorId));
    const successor = taskMap.get(keyOf(successorId));
    if (!predecessor || !successor)
        throw serviceError('Selected dependency tasks were not found.', 404, 'DEPENDENCY_NOT_FOUND');
    if (!successor.predecessors.some(id => keyOf(id) === keyOf(predecessorId)))
        throw serviceError('The selected tasks are not connected by that dependency.', 404, 'DEPENDENCY_NOT_FOUND');

    const beforeReport = evaluatePlanReadiness(project, wbsNodes, tasks);
    const conflict = beforeReport.findings.find(finding => finding.code === 'DATE_ORDER_CONFLICT'
        && keyOf(finding.edge?.predecessorId) === keyOf(predecessorId)
        && keyOf(finding.edge?.successorId) === keyOf(successorId));
    if (!conflict)
        throw serviceError('The selected dependency does not have a date-order conflict.', 409, 'NO_DATE_ORDER_CONFLICT');

    const originalById = new Map(tasks.map(task => [keyOf(task.id), {
        planned_start: task.planned_start,
        planned_end: task.planned_end,
    }]));

    if (remedy === 'remove_dependency') {
        successor.predecessors = successor.predecessors.filter(id => keyOf(id) !== keyOf(predecessorId));
    } else {
        const graph = graphFor(tasks);
        if (graph.cycleKeys.length)
            throw serviceError('Shift preview is unavailable while the plan contains a dependency cycle.', 422, 'DEPENDENCY_CYCLE');

        const affected = new Set([keyOf(successorId)]);
        const queue = [keyOf(successorId)];
        while (queue.length) {
            const current = queue.shift();
            for (const child of graph.successors.get(current) || []) {
                if (!affected.has(child)) {
                    affected.add(child);
                    queue.push(child);
                }
            }
        }

        for (const taskKey of graph.order) {
            if (!affected.has(taskKey)) continue;
            const task = taskMap.get(taskKey);
            const start = parseUtcDay(task.planned_start);
            const end = parseUtcDay(task.planned_end);
            if (start == null || end == null || end < start) continue;
            const predecessorEnds = task.predecessors
                .map(id => parseUtcDay(taskMap.get(keyOf(id))?.planned_end))
                .filter(value => value != null);
            if (!predecessorEnds.length) continue;
            const requiredStart = Math.max(...predecessorEnds);
            if (start < requiredStart) {
                const duration = end - start;
                task.planned_start = formatUtcDay(requiredStart);
                task.planned_end = formatUtcDay(requiredStart + duration);
            }
        }
    }

    const afterReport = evaluatePlanReadiness(project, wbsNodes, tasks);
    const changes = tasks
        .filter(task => {
            const original = originalById.get(keyOf(task.id));
            return original.planned_start !== task.planned_start || original.planned_end !== task.planned_end;
        })
        .map(task => ({
            taskId: comparableId(task.id),
            taskName: taskLabel(task),
            before: originalById.get(keyOf(task.id)),
            after: { planned_start: task.planned_start, planned_end: task.planned_end },
        }));

    const beforeIds = new Set(beforeReport.findings.map(findingIdentity));
    const afterIds = new Set(afterReport.findings.map(findingIdentity));

    return {
        remedy,
        sourceEdge: { predecessorId: comparableId(predecessorId), successorId: comparableId(successorId) },
        before: reportSnapshot(beforeReport, project, sourceTasks),
        after: reportSnapshot(afterReport, project, tasks),
        changes,
        resolvedFindings: beforeReport.findings.filter(finding => !afterIds.has(findingIdentity(finding))),
        introducedFindings: afterReport.findings.filter(finding => !beforeIds.has(findingIdentity(finding))),
        persisted: false,
    };
}

module.exports = { previewDependencyRemedy };
