const DAY_MS = 24 * 60 * 60 * 1000;

const SEVERITY_ORDER = { blocker: 0, warning: 1, info: 2 };

function keyOf(value) {
    return String(value);
}

function comparableId(value) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
}

function parseUtcDay(value) {
    if (!value) return null;
    const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    const parsed = new Date(time);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return time;
}

function formatUtcDay(time) {
    return new Date(time).toISOString().slice(0, 10);
}

function daysBetween(from, to) {
    if (from == null || to == null) return null;
    return Math.round((to - from) / DAY_MS);
}

function taskLabel(task) {
    return task?.task_name || `Task ${task?.id}`;
}

function makeFinding({ code, severity, title, explanation, taskIds = [], wbsIds = [], edge = null, previewAvailable = false }) {
    return {
        code,
        severity,
        title,
        explanation,
        taskIds: taskIds.map(comparableId),
        ...(wbsIds.length ? { wbsIds: wbsIds.map(comparableId) } : {}),
        ...(edge ? {
            edge: {
                predecessorId: comparableId(edge.predecessorId),
                successorId: comparableId(edge.successorId),
            },
            previewAvailable,
        } : {}),
    };
}

function graphFor(tasks) {
    const taskMap = new Map(tasks.map(task => [keyOf(task.id), task]));
    const successors = new Map(tasks.map(task => [keyOf(task.id), []]));
    const indegree = new Map(tasks.map(task => [keyOf(task.id), 0]));

    for (const task of tasks) {
        const successorKey = keyOf(task.id);
        for (const predecessorId of Array.isArray(task.predecessors) ? task.predecessors : []) {
            const predecessorKey = keyOf(predecessorId);
            if (!taskMap.has(predecessorKey) || predecessorKey === successorKey) continue;
            successors.get(predecessorKey).push(successorKey);
            indegree.set(successorKey, indegree.get(successorKey) + 1);
        }
    }

    for (const list of successors.values()) list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const queue = [...indegree.entries()]
        .filter(([, count]) => count === 0)
        .map(([id]) => id)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const order = [];

    while (queue.length) {
        const current = queue.shift();
        order.push(current);
        for (const successor of successors.get(current) || []) {
            const next = indegree.get(successor) - 1;
            indegree.set(successor, next);
            if (next === 0) {
                queue.push(successor);
                queue.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            }
        }
    }

    const orderedKeys = new Set(order);
    const cycleKeys = [...taskMap.keys()].filter(id => !orderedKeys.has(id));
    return { taskMap, successors, order, cycleKeys };
}

function findingIdentity(finding) {
    const tasks = [...(finding.taskIds || [])].map(keyOf).sort().join(',');
    const edge = finding.edge ? `${keyOf(finding.edge.predecessorId)}>${keyOf(finding.edge.successorId)}` : '';
    return `${finding.code}|${tasks}|${edge}`;
}

function summarize(findings) {
    return findings.reduce((summary, finding) => {
        if (finding.severity === 'blocker') summary.blockers += 1;
        else if (finding.severity === 'warning') summary.warnings += 1;
        else summary.info += 1;
        return summary;
    }, { blockers: 0, warnings: 0, info: 0 });
}

function evaluatePlanReadiness(project = {}, wbsNodes = [], tasks = []) {
    const findings = [];
    const wbsIds = new Set((wbsNodes || []).map(node => keyOf(node.id)));
    const taskMap = new Map((tasks || []).map(task => [keyOf(task.id), task]));
    const projectStart = parseUtcDay(project.planned_start);
    const projectEnd = parseUtcDay(project.planned_end);
    const graph = graphFor(tasks || []);
    const hasCycle = graph.cycleKeys.length > 0;

    if (!tasks || tasks.length === 0) {
        findings.push(makeFinding({
            code: 'NO_TASKS', severity: 'blocker', title: 'No tasks in the plan',
            explanation: 'Add at least one planned task before locking a baseline.',
        }));
    }

    const missingWbs = (tasks || []).filter(task => task.wbs_id == null || task.wbs_id === '' || !wbsIds.has(keyOf(task.wbs_id)));
    if (missingWbs.length) {
        findings.push(makeFinding({
            code: 'MISSING_WBS', severity: 'blocker', title: 'Tasks are not linked to a valid WBS node',
            explanation: `${missingWbs.length} task${missingWbs.length === 1 ? '' : 's'} must be assigned to an existing WBS node.`,
            taskIds: missingWbs.map(task => task.id),
        }));
    }

    for (const task of tasks || []) {
        const start = parseUtcDay(task.planned_start);
        const end = parseUtcDay(task.planned_end);
        if (start == null || end == null) {
            findings.push(makeFinding({
                code: 'INVALID_TASK_DATES', severity: 'blocker', title: 'Task dates are missing or invalid',
                explanation: `${taskLabel(task)} needs valid planned start and finish dates.`, taskIds: [task.id],
            }));
            continue;
        }
        if (end < start) {
            findings.push(makeFinding({
                code: 'TASK_END_BEFORE_START', severity: 'blocker', title: 'Task finish is before its start',
                explanation: `${taskLabel(task)} finishes before it starts.`, taskIds: [task.id],
            }));
        }
        if ((projectStart != null && start < projectStart) || (projectEnd != null && end > projectEnd)) {
            findings.push(makeFinding({
                code: 'TASK_OUTSIDE_PROJECT_DATES', severity: 'blocker', title: 'Task falls outside project dates',
                explanation: `${taskLabel(task)} must stay within the project's planned start and finish.`, taskIds: [task.id],
            }));
        }
    }

    const totalWeight = (tasks || []).reduce((sum, task) => sum + (Number(task.weight) || 0), 0);
    if (tasks?.length && (totalWeight < 0.999 || totalWeight > 1.001)) {
        findings.push(makeFinding({
            code: 'WEIGHT_TOTAL_INVALID', severity: 'blocker', title: 'Task weights do not total 100%',
            explanation: `Current task weight is ${(totalWeight * 100).toFixed(1)}%. Adjust the plan to total 100%.`,
            taskIds: tasks.map(task => task.id),
        }));
    }

    for (const task of tasks || []) {
        const successorKey = keyOf(task.id);
        for (const predecessorId of Array.isArray(task.predecessors) ? task.predecessors : []) {
            const predecessorKey = keyOf(predecessorId);
            if (predecessorKey === successorKey) {
                findings.push(makeFinding({
                    code: 'SELF_DEPENDENCY', severity: 'blocker', title: 'Task depends on itself',
                    explanation: `${taskLabel(task)} cannot be its own predecessor.`, taskIds: [task.id],
                    edge: { predecessorId, successorId: task.id },
                }));
                continue;
            }
            const predecessor = taskMap.get(predecessorKey);
            if (!predecessor) {
                findings.push(makeFinding({
                    code: 'MISSING_PREDECESSOR', severity: 'blocker', title: 'Dependency references a missing task',
                    explanation: `${taskLabel(task)} references predecessor ${predecessorId}, which is not in this project.`,
                    taskIds: [task.id], edge: { predecessorId, successorId: task.id },
                }));
                continue;
            }
            const predecessorEnd = parseUtcDay(predecessor.planned_end);
            const successorStart = parseUtcDay(task.planned_start);
            if (predecessorEnd != null && successorStart != null && successorStart < predecessorEnd) {
                findings.push(makeFinding({
                    code: 'DATE_ORDER_CONFLICT', severity: 'blocker', title: 'Successor starts before predecessor finishes',
                    explanation: `${taskLabel(task)} starts before ${taskLabel(predecessor)} finishes.`,
                    taskIds: [predecessor.id, task.id],
                    edge: { predecessorId: predecessor.id, successorId: task.id },
                    previewAvailable: !hasCycle,
                }));
            }
        }
    }

    if (hasCycle) {
        findings.push(makeFinding({
            code: 'DEPENDENCY_CYCLE', severity: 'blocker', title: 'Dependency cycle detected',
            explanation: 'The listed tasks form a circular dependency. Remove at least one relationship before scheduling.',
            taskIds: graph.cycleKeys.map(id => graph.taskMap.get(id).id),
        }));
    }

    const validEdgeCount = (tasks || []).reduce((count, task) => count + (Array.isArray(task.predecessors)
        ? task.predecessors.filter(id => taskMap.has(keyOf(id)) && keyOf(id) !== keyOf(task.id)).length
        : 0), 0);
    if ((tasks || []).length > 1 && validEdgeCount === 0) {
        findings.push(makeFinding({
            code: 'NO_DEPENDENCY_NETWORK', severity: 'warning', title: 'Plan has no dependency network',
            explanation: 'Multi-task plans are easier to validate when sequencing relationships are defined.',
            taskIds: tasks.map(task => task.id),
        }));
    } else if ((tasks || []).length > 1) {
        const connected = new Set();
        for (const task of tasks) {
            for (const predecessorId of Array.isArray(task.predecessors) ? task.predecessors : []) {
                if (taskMap.has(keyOf(predecessorId)) && keyOf(predecessorId) !== keyOf(task.id)) {
                    connected.add(keyOf(task.id));
                    connected.add(keyOf(predecessorId));
                }
            }
        }
        const isolated = tasks.filter(task => !connected.has(keyOf(task.id)));
        if (isolated.length) findings.push(makeFinding({
            code: 'ISOLATED_TASKS', severity: 'warning', title: 'Tasks are isolated from the dependency network',
            explanation: `${isolated.length} task${isolated.length === 1 ? '' : 's'} have no predecessor or successor.`,
            taskIds: isolated.map(task => task.id),
        }));
    }

    const zeroCost = (tasks || []).filter(task => !(Number(task.planned_cost) > 0));
    if (zeroCost.length) findings.push(makeFinding({
        code: 'ZERO_PLANNED_COST', severity: 'warning', title: 'Tasks have no planned cost',
        explanation: `${zeroCost.length} task${zeroCost.length === 1 ? '' : 's'} have zero planned cost.`,
        taskIds: zeroCost.map(task => task.id),
    }));

    const zeroHours = (tasks || []).filter(task => !(Number(task.planned_hours) > 0));
    if (zeroHours.length) findings.push(makeFinding({
        code: 'ZERO_PLANNED_HOURS', severity: 'warning', title: 'Tasks have no planned hours',
        explanation: `${zeroHours.length} task${zeroHours.length === 1 ? '' : 's'} have zero planned hours.`,
        taskIds: zeroHours.map(task => task.id),
    }));

    const plannedCost = (tasks || []).reduce((sum, task) => sum + (Number(task.planned_cost) || 0), 0);
    const projectBudget = Number(project.total_budget) || 0;
    const budgetDelta = projectBudget - plannedCost;
    if (budgetDelta !== 0) findings.push(makeFinding({
        code: 'BUDGET_VARIANCE', severity: 'info', title: 'Project budget differs from planned task cost',
        explanation: `Budget variance is IDR ${Math.abs(budgetDelta).toLocaleString('en-US')}${budgetDelta >= 0 ? ' remaining' : ' over budget'}.`,
    }));

    findings.sort((a, b) => {
        const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (severity !== 0) return severity;
        const code = a.code.localeCompare(b.code);
        if (code !== 0) return code;
        return findingIdentity(a).localeCompare(findingIdentity(b), undefined, { numeric: true });
    });

    const summary = summarize(findings);
    const state = summary.blockers > 0 ? 'blocked' : summary.warnings > 0 ? 'ready_with_warnings' : 'ready';

    return {
        state,
        summary,
        metrics: {
            taskCount: (tasks || []).length,
            wbsCount: (wbsNodes || []).length,
            totalWeight: Number(totalWeight.toFixed(4)),
            plannedCost,
            projectBudget,
            budgetDelta,
        },
        findings,
    };
}

module.exports = {
    evaluatePlanReadiness,
    parseUtcDay,
    __internal: {
        DAY_MS,
        comparableId,
        daysBetween,
        findingIdentity,
        formatUtcDay,
        graphFor,
        keyOf,
        taskLabel,
    },
};
