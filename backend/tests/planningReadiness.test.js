const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const {
    evaluatePlanReadiness,
} = require('../services/planningReadinessService');
const { previewDependencyRemedy } = require('../services/dependencyPreviewService');

const project = {
    id: 1,
    planned_start: '2026-01-01',
    planned_end: '2026-01-31',
    total_budget: 300,
};

const wbs = [{ id: 10, wbs_code: '1.1', name: 'Delivery' }];

function task(overrides = {}) {
    return {
        id: 1,
        wbs_id: 10,
        task_name: 'Task 1',
        planned_start: '2026-01-01',
        planned_end: '2026-01-05',
        planned_cost: 100,
        planned_hours: 8,
        weight: 1,
        predecessors: [],
        ...overrides,
    };
}

function codes(report) {
    return report.findings.map(finding => finding.code);
}

test('empty project is blocked', () => {
    const report = evaluatePlanReadiness(project, wbs, []);
    assert.equal(report.state, 'blocked');
    assert.ok(codes(report).includes('NO_TASKS'));
});

test('missing and nonexistent WBS assignments are blocked', () => {
    const report = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.5, wbs_id: null }),
        task({ id: 2, weight: 0.5, wbs_id: 999 }),
    ]);
    const finding = report.findings.find(item => item.code === 'MISSING_WBS');
    assert.deepEqual(finding.taskIds, [1, 2]);
});

test('invalid, reversed and out-of-project dates are blocked', () => {
    const report = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.34, planned_start: 'bad' }),
        task({ id: 2, weight: 0.33, planned_start: '2026-01-10', planned_end: '2026-01-09' }),
        task({ id: 3, weight: 0.33, planned_end: '2026-02-01' }),
    ]);
    assert.ok(codes(report).includes('INVALID_TASK_DATES'));
    assert.ok(codes(report).includes('TASK_END_BEFORE_START'));
    assert.ok(codes(report).includes('TASK_OUTSIDE_PROJECT_DATES'));
});

test('weight tolerance accepts 99.9% through 100.1%', () => {
    assert.ok(!codes(evaluatePlanReadiness(project, wbs, [task({ weight: 0.999 })])).includes('WEIGHT_TOTAL_INVALID'));
    assert.ok(!codes(evaluatePlanReadiness(project, wbs, [task({ weight: 1.001 })])).includes('WEIGHT_TOTAL_INVALID'));
    assert.ok(codes(evaluatePlanReadiness(project, wbs, [task({ weight: 0.998 })])).includes('WEIGHT_TOTAL_INVALID'));
    assert.ok(codes(evaluatePlanReadiness(project, wbs, [task({ weight: 1.002 })])).includes('WEIGHT_TOTAL_INVALID'));
});

test('self, dangling and cyclic dependencies are blocked', () => {
    const self = evaluatePlanReadiness(project, wbs, [task({ predecessors: [1] })]);
    assert.ok(codes(self).includes('SELF_DEPENDENCY'));

    const dangling = evaluatePlanReadiness(project, wbs, [task({ predecessors: [99] })]);
    assert.ok(codes(dangling).includes('MISSING_PREDECESSOR'));

    const cycle = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.5, predecessors: [2] }),
        task({ id: 2, weight: 0.5, predecessors: [1] }),
    ]);
    assert.ok(codes(cycle).includes('DEPENDENCY_CYCLE'));
});

test('same-day handoff is valid and earlier successor is a previewable conflict', () => {
    const valid = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.5, planned_end: '2026-01-05' }),
        task({ id: 2, weight: 0.5, planned_start: '2026-01-05', planned_end: '2026-01-08', predecessors: [1] }),
    ]);
    assert.ok(!codes(valid).includes('DATE_ORDER_CONFLICT'));

    const invalid = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.5, planned_end: '2026-01-05' }),
        task({ id: 2, weight: 0.5, planned_start: '2026-01-04', planned_end: '2026-01-08', predecessors: [1] }),
    ]);
    const finding = invalid.findings.find(item => item.code === 'DATE_ORDER_CONFLICT');
    assert.equal(finding.previewAvailable, true);
});

test('network, isolated, cost and hours warnings do not block a structurally valid plan', () => {
    const noNetwork = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.5 }),
        task({ id: 2, weight: 0.5, planned_cost: 0, planned_hours: 0 }),
    ]);
    assert.equal(noNetwork.state, 'ready_with_warnings');
    assert.ok(codes(noNetwork).includes('NO_DEPENDENCY_NETWORK'));
    assert.ok(codes(noNetwork).includes('ZERO_PLANNED_COST'));
    assert.ok(codes(noNetwork).includes('ZERO_PLANNED_HOURS'));

    const isolated = evaluatePlanReadiness(project, wbs, [
        task({ id: 1, weight: 0.34 }),
        task({ id: 2, weight: 0.33, planned_start: '2026-01-05', planned_end: '2026-01-08', predecessors: [1] }),
        task({ id: 3, weight: 0.33 }),
    ]);
    assert.ok(codes(isolated).includes('ISOLATED_TASKS'));
});

test('budget variance is informational', () => {
    const report = evaluatePlanReadiness(project, wbs, [task()]);
    const finding = report.findings.find(item => item.code === 'BUDGET_VARIANCE');
    assert.equal(finding.severity, 'info');
    assert.equal(report.metrics.budgetDelta, 200);
});

test('shift preview preserves duration and propagates using the latest predecessor', () => {
    const tasks = [
        task({ id: 1, task_name: 'A', weight: 0.25, planned_start: '2026-01-01', planned_end: '2026-01-06' }),
        task({ id: 2, task_name: 'B', weight: 0.25, planned_start: '2026-01-01', planned_end: '2026-01-08' }),
        task({ id: 3, task_name: 'C', weight: 0.25, planned_start: '2026-01-05', planned_end: '2026-01-07', predecessors: [1, 2] }),
        task({ id: 4, task_name: 'D', weight: 0.25, planned_start: '2026-01-06', planned_end: '2026-01-09', predecessors: [3] }),
    ];
    const original = JSON.stringify(tasks);
    const preview = previewDependencyRemedy(project, wbs, tasks, {
        predecessorId: 2, successorId: 3, remedy: 'shift_successor_chain',
    });
    assert.equal(preview.persisted, false);
    assert.equal(JSON.stringify(tasks), original);
    assert.deepEqual(preview.changes.map(change => change.taskId), [3, 4]);
    assert.deepEqual(preview.changes[0].after, { planned_start: '2026-01-08', planned_end: '2026-01-10' });
    assert.deepEqual(preview.changes[1].after, { planned_start: '2026-01-10', planned_end: '2026-01-13' });
});

test('remove dependency preview changes no dates and can introduce network warnings', () => {
    const tasks = [
        task({ id: 1, weight: 0.5, planned_end: '2026-01-06' }),
        task({ id: 2, weight: 0.5, planned_start: '2026-01-05', planned_end: '2026-01-09', predecessors: [1] }),
    ];
    const preview = previewDependencyRemedy(project, wbs, tasks, {
        predecessorId: 1, successorId: 2, remedy: 'remove_dependency',
    });
    assert.deepEqual(preview.changes, []);
    assert.ok(preview.introducedFindings.some(item => item.code === 'NO_DEPENDENCY_NETWORK'));
});

test('shift preview is rejected while any cycle exists', () => {
    const tasks = [
        task({ id: 1, weight: 0.25, planned_end: '2026-01-06' }),
        task({ id: 2, weight: 0.25, planned_start: '2026-01-05', planned_end: '2026-01-09', predecessors: [1] }),
        task({ id: 3, weight: 0.25, predecessors: [4] }),
        task({ id: 4, weight: 0.25, predecessors: [3] }),
    ];
    assert.throws(() => previewDependencyRemedy(project, wbs, tasks, {
        predecessorId: 1, successorId: 2, remedy: 'shift_successor_chain',
    }), error => error.code === 'DEPENDENCY_CYCLE' && error.statusCode === 422);
});

test('findings are returned in deterministic severity and code order', () => {
    const first = evaluatePlanReadiness(project, wbs, [task({ weight: 0.5, planned_cost: 0, planned_hours: 0 })]);
    const second = evaluatePlanReadiness(project, wbs, [task({ weight: 0.5, planned_cost: 0, planned_hours: 0 })]);
    assert.deepEqual(first, second);
    assert.deepEqual(first.findings.map(item => item.severity), ['blocker', 'warning', 'warning', 'info']);
});

test('1,000-task readiness fixture stays below 300 ms at p95 locally', () => {
    const largeProject = { ...project, planned_end: '2030-12-31', total_budget: 1000 };
    const largeTasks = Array.from({ length: 1000 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
        return task({
            id: index + 1,
            task_name: `Task ${index + 1}`,
            planned_start: date,
            planned_end: date,
            planned_cost: 1,
            weight: 0.001,
            predecessors: index === 0 ? [] : [index],
        });
    });

    evaluatePlanReadiness(largeProject, wbs, largeTasks);
    const samples = Array.from({ length: 20 }, () => {
        const startedAt = performance.now();
        evaluatePlanReadiness(largeProject, wbs, largeTasks);
        return performance.now() - startedAt;
    }).sort((a, b) => a - b);

    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    assert.ok(p95 < 300, `Expected p95 below 300 ms, received ${p95.toFixed(1)} ms`);
});
