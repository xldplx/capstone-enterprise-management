const test = require('node:test');
const assert = require('node:assert/strict');

const agile = require('../services/agileService');
const { parseUtcDay } = require('../services/planningReadinessService');

// Every helper takes `today` explicitly so these tests do not drift with the
// clock. Midday UTC keeps the Asia/Jakarta (UTC+7) conversion inside the same
// calendar day when a Date is passed through utcToday().
const day = (iso) => parseUtcDay(iso);
const at  = (iso) => new Date(`${iso}T12:00:00Z`);

const project = {
    id: 1,
    planned_start: '2026-03-02', // a Monday
    planned_end:   '2026-03-31',
};

function task(overrides = {}) {
    return {
        id: 1,
        task_name: 'Task 1',
        wbs_code: '1.1',
        planned_start: '2026-03-02',
        planned_end:   '2026-03-13',
        planned_cost:  1000,
        planned_hours: 40,
        actual_hours:  0,
        weight:        0.05,
        pct_complete:  0,
        ...overrides,
    };
}

// ── Sprint tiling ────────────────────────────────────────────────────────────

test('tiles sprints across the project window at the given cadence', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-10'));

    assert.equal(sprints.length, 3);
    assert.deepEqual(
        sprints.map(s => [s.start_date, s.end_date]),
        [
            ['2026-03-02', '2026-03-15'],
            ['2026-03-16', '2026-03-29'],
            ['2026-03-30', '2026-03-31'],
        ],
    );
});

test('final sprint is truncated at the project end, not overrun', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-10'));
    const last = sprints[sprints.length - 1];

    assert.equal(last.end_date, project.planned_end);
    assert.equal(last.days, 2);
});

test('sprint state follows today', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-20'));

    assert.deepEqual(sprints.map(s => s.state), ['completed', 'active', 'planned']);
});

test('a project without planned dates yields no sprints', () => {
    assert.deepEqual(agile.tileSprints({ planned_start: null, planned_end: null }, 14, day('2026-03-10')), []);
    assert.deepEqual(agile.tileSprints({}, 14, day('2026-03-10')), []);
});

test('an invalid cadence falls back to the default rather than looping', () => {
    const sprints = agile.tileSprints(project, 0, day('2026-03-10'));
    assert.equal(sprints.length, 3);
});

test('a one-day project produces a single one-day sprint', () => {
    const sprints = agile.tileSprints(
        { planned_start: '2026-03-02', planned_end: '2026-03-02' }, 14, day('2026-03-02'));

    assert.equal(sprints.length, 1);
    assert.equal(sprints[0].days, 1);
    assert.equal(sprints[0].state, 'active');
});

// ── Sprint membership ────────────────────────────────────────────────────────

test('a task spanning several sprints appears in each of them', () => {
    const long = task({ id: 7, planned_start: '2026-03-02', planned_end: '2026-03-31' });
    const sprints = agile.tileSprints(project, 14, day('2026-03-10'));

    sprints.forEach(sprint => {
        assert.equal(agile.tasksInSprint([long], sprint).length, 1, `missing from sprint ${sprint.number}`);
    });
});

test('undated tasks belong to no sprint', () => {
    const undated = task({ id: 8, planned_start: null, planned_end: null });
    const [sprint] = agile.tileSprints(project, 14, day('2026-03-10'));

    assert.deepEqual(agile.tasksInSprint([undated], sprint), []);
});

test('a task dated on one end only is placed by the date it has', () => {
    const [first, second] = agile.tileSprints(project, 14, day('2026-03-10'));
    const endOnly = task({ id: 9, planned_start: null, planned_end: '2026-03-20' });

    assert.equal(agile.tasksInSprint([endOnly], first).length, 0);
    assert.equal(agile.tasksInSprint([endOnly], second).length, 1);
});

// ── Board columns ────────────────────────────────────────────────────────────

test('columns are derived from pct_complete at the boundaries', () => {
    const today = day('2026-03-10');

    assert.equal(agile.classifyTask(task({ pct_complete: 0 }),   today), 'todo');
    assert.equal(agile.classifyTask(task({ pct_complete: 1 }),   today), 'in_progress');
    assert.equal(agile.classifyTask(task({ pct_complete: 99 }),  today), 'in_progress');
    assert.equal(agile.classifyTask(task({ pct_complete: 100 }), today), 'done');
});

test('an overdue unfinished task is at risk whatever its progress', () => {
    const overdue = task({ planned_end: '2026-03-05', pct_complete: 60 });
    assert.equal(agile.classifyTask(overdue, day('2026-03-10')), 'at_risk');
});

test('a task due today is not yet at risk, and a finished overdue task is done', () => {
    const today = day('2026-03-10');

    assert.equal(agile.classifyTask(task({ planned_end: '2026-03-10', pct_complete: 20 }), today), 'in_progress');
    assert.equal(agile.classifyTask(task({ planned_end: '2026-03-05', pct_complete: 100 }), today), 'done');
});

test('a task with no end date is never at risk', () => {
    assert.equal(agile.classifyTask(task({ planned_end: null, pct_complete: 0 }), day('2026-03-10')), 'todo');
});

test('cards report float and overdue days on the app-wide convention', () => {
    const onTime  = agile.toCard(task({ planned_end: '2026-03-20' }), day('2026-03-10'));
    const overdue = agile.toCard(task({ planned_end: '2026-03-05' }), day('2026-03-10'));

    assert.equal(onTime.float, 10);
    assert.equal(onTime.days_overdue, 0);
    // float stays clamped at zero like tasksController.computeFloat; the overdue
    // amount is carried separately rather than as a negative float.
    assert.equal(overdue.float, 0);
    assert.equal(overdue.days_overdue, 5);
});

// ── Story points ─────────────────────────────────────────────────────────────

test('weight maps onto the fibonacci scale as a percentage of the project', () => {
    assert.equal(agile.storyPoints(task({ weight: 0.05 })), 5);
    assert.equal(agile.storyPoints(task({ weight: 0.13 })), 13);
    assert.equal(agile.storyPoints(task({ weight: 0.01 })), 1);
    assert.equal(agile.storyPoints(task({ weight: 0.20 })), 21);
});

test('a task with no weight is unestimated rather than zero points', () => {
    assert.equal(agile.storyPoints(task({ weight: 0 })), null);
    assert.equal(agile.storyPoints(task({ weight: null })), null);
});

test('PostgREST numeric strings are coerced before arithmetic', () => {
    // Supabase returns NUMERIC columns as strings; '0.05' must not stringify.
    assert.equal(agile.storyPoints(task({ weight: '0.05' })), 5);
    assert.equal(agile.toCard(task({ pct_complete: '100' }), day('2026-03-10')).column, 'done');
});

// ── Sprint metrics ───────────────────────────────────────────────────────────

test('sprint metrics roll points up by column', () => {
    const tasks = [
        task({ id: 1, weight: 0.05, pct_complete: 100 }),
        task({ id: 2, weight: 0.13, pct_complete: 50 }),
        task({ id: 3, weight: 0.03, pct_complete: 0 }),
    ];

    const metrics = agile.computeSprintMetrics(tasks, day('2026-03-10'));

    assert.equal(metrics.task_count, 3);
    assert.equal(metrics.committed_points, 21);
    assert.equal(metrics.completed_points, 5);
    assert.equal(metrics.remaining_points, 16);
    assert.deepEqual(metrics.counts, { todo: 1, in_progress: 1, at_risk: 0, done: 1 });
});

test('unestimated tasks are counted, and completion falls back to task count', () => {
    const tasks = [
        task({ id: 1, weight: 0, pct_complete: 100 }),
        task({ id: 2, weight: 0, pct_complete: 0 }),
    ];

    const metrics = agile.computeSprintMetrics(tasks, day('2026-03-10'));

    assert.equal(metrics.unestimated_tasks, 2);
    assert.equal(metrics.committed_points, 0);
    // No points to measure against, so completion is by card count instead.
    assert.equal(metrics.completion_pct, 50);
});

test('an empty sprint reports zeroes, not NaN', () => {
    const metrics = agile.computeSprintMetrics([], day('2026-03-10'));

    assert.equal(metrics.committed_points, 0);
    assert.equal(metrics.completion_pct, 0);
    assert.equal(metrics.task_count, 0);
});

// ── Burndown ─────────────────────────────────────────────────────────────────

const sprint = { number: 1, start_date: '2026-03-02', end_date: '2026-03-06' };

test('burndown reconstructs history from an out-of-order ledger', () => {
    const tasks = [
        task({ id: 1, weight: 0.05, pct_complete: 100 }), //  5 points
        task({ id: 2, weight: 0.03, pct_complete: 100 }), //  3 points
    ];

    // Deliberately unsorted, as the API returns entry_date descending.
    const ledger = [
        { task_id: 2, entry_date: '2026-03-05', pct_complete: 100 },
        { task_id: 1, entry_date: '2026-03-03', pct_complete: 100 },
    ];

    const { days, committed_points } = agile.computeBurndown(sprint, tasks, ledger, day('2026-03-06'));

    assert.equal(committed_points, 8);
    // 03-03 task 1 (5 pts) lands -> 3 left; 03-05 task 2 (3 pts) lands -> 0.
    assert.deepEqual(days.map(d => d.remaining), [8, 3, 3, 0, 0]);
});

test('partial progress burns down proportionally', () => {
    const tasks = [task({ id: 1, weight: 0.10, pct_complete: 50 })]; // 8 points
    const ledger = [{ task_id: 1, entry_date: '2026-03-03', pct_complete: 50 }];

    const { days } = agile.computeBurndown(sprint, tasks, ledger, day('2026-03-04'));

    assert.equal(days[0].remaining, 8);
    assert.equal(days[1].remaining, 4);
    assert.equal(days[2].remaining, 4);
});

test('the ideal line runs from the committed total to zero', () => {
    const tasks = [task({ id: 1, weight: 0.08 })]; // 8 points over 5 days

    const { days } = agile.computeBurndown(sprint, tasks, [], day('2026-03-02'));

    assert.deepEqual(days.map(d => d.ideal), [8, 6, 4, 2, 0]);
});

test('days after today are null so the chart does not imply a stall', () => {
    const tasks = [task({ id: 1, weight: 0.08 })];

    const { days } = agile.computeBurndown(sprint, tasks, [], day('2026-03-03'));

    assert.equal(days[1].remaining, 8);
    assert.deepEqual(days.slice(2).map(d => d.remaining), [null, null, null]);
    // The ideal line still runs the full window — that is the plan, not history.
    assert.ok(days.every(d => d.ideal !== null));
});

test('progress with no ledger row still lands on the latest plotted day', () => {
    // Entered through PUT /api/tasks/:id, so daily_actuals never saw it.
    const tasks = [task({ id: 1, weight: 0.08, pct_complete: 100 })];

    const { days } = agile.computeBurndown(sprint, tasks, [], day('2026-03-04'));

    assert.equal(days[1].remaining, 8);  // history has no evidence of it
    assert.equal(days[2].remaining, 0);  // today reconciles with the task row
});

test('a sprint with no committed points burns down flat at zero', () => {
    const { days, committed_points } = agile.computeBurndown(
        sprint, [task({ id: 1, weight: 0 })], [], day('2026-03-06'));

    assert.equal(committed_points, 0);
    assert.deepEqual(days.map(d => d.remaining), [0, 0, 0, 0, 0]);
});

test('a sprint without dates yields an empty burndown rather than throwing', () => {
    assert.deepEqual(agile.computeBurndown({}, [task()], [], day('2026-03-06')), { days: [], committed_points: 0 });
});

// ── Velocity ─────────────────────────────────────────────────────────────────

test('velocity credits a sprint only for work finished by its own end date', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-20'));
    const tasks = [task({ id: 1, weight: 0.05, planned_start: '2026-03-02', planned_end: '2026-03-10', pct_complete: 100 })];

    // Finished during sprint 2, long after sprint 1 closed.
    const ledger = [{ task_id: 1, entry_date: '2026-03-18', pct_complete: 100 }];

    const velocity = agile.computeVelocity(sprints, tasks, ledger, day('2026-03-20'));

    assert.equal(velocity.history.length, 1); // only sprint 1 has completed
    assert.equal(velocity.history[0].committed_points, 5);
    assert.equal(velocity.history[0].completed_points, 0);
});

test('velocity with no completed sprints averages zero rather than dividing by zero', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-03'));
    const velocity = agile.computeVelocity(sprints, [task()], [], day('2026-03-03'));

    assert.deepEqual(velocity.history, []);
    assert.equal(velocity.average_points, 0);
    assert.equal(velocity.sprints_measured, 0);
});

// ── Capacity ─────────────────────────────────────────────────────────────────

test('working days exclude weekends', () => {
    // Mon 2 Mar to Sun 15 Mar 2026 — two full weeks.
    assert.equal(agile.workingDays('2026-03-02', '2026-03-15'), 10);
    assert.equal(agile.workingDays('2026-03-07', '2026-03-08'), 0); // Sat + Sun
});

test('capacity flags an over-committed sprint', () => {
    const personnel = [{ status: 'active' }, { status: 'active' }, { status: 'inactive' }];
    const capacity = agile.computeCapacity(
        { start_date: '2026-03-02', end_date: '2026-03-06' }, personnel, { planned_hours: 100 });

    assert.equal(capacity.headcount, 2);
    assert.equal(capacity.working_days, 5);
    assert.equal(capacity.available_hours, 80); // 2 people x 5 days x 8h
    assert.equal(capacity.over_committed, true);
});

test('capacity with no personnel reports no percentage instead of infinity', () => {
    const capacity = agile.computeCapacity(
        { start_date: '2026-03-02', end_date: '2026-03-06' }, [], { planned_hours: 100 });

    assert.equal(capacity.available_hours, 0);
    assert.equal(capacity.used_pct, null);
    assert.equal(capacity.over_committed, false);
});

// ── Backlog ──────────────────────────────────────────────────────────────────

test('the backlog holds unscheduled, unfinished work ranked by urgency', () => {
    const sprints = agile.tileSprints(project, 14, day('2026-03-10'));
    const tasks = [
        task({ id: 1, planned_start: '2026-03-02', planned_end: '2026-03-06' }), // in sprint 1
        task({ id: 2, planned_start: null, planned_end: null, weight: 0.03 }),
        task({ id: 3, planned_start: null, planned_end: null, weight: 0.13 }),
        task({ id: 4, planned_start: null, planned_end: null, pct_complete: 100 }),
    ];

    const backlog = agile.buildBacklog(tasks, sprints, day('2026-03-10'));

    // Scheduled task and the finished one are both excluded.
    assert.deepEqual(backlog.map(card => card.id), [3, 2]);
});

// ── Composition ──────────────────────────────────────────────────────────────

test('buildOverview summarises every sprint and picks the active one', () => {
    const overview = agile.buildOverview({
        project,
        tasks: [task({ id: 1, weight: 0.05, pct_complete: 100 })],
        dailyActuals: [{ task_id: 1, entry_date: '2026-03-04', pct_complete: 100 }],
        personnel: [{ status: 'active' }],
        cadenceDays: 14,
        now: at('2026-03-20'),
    });

    assert.equal(overview.sprints.length, 3);
    assert.equal(overview.active_sprint, 2);
    assert.equal(overview.cadence_days, 14);
    assert.equal(overview.today, '2026-03-20');
    assert.ok(overview.capacity);
    assert.equal(overview.sprints[0].metrics.completed_points, 5);
});

test('buildSprintDetail returns board columns and a burndown', () => {
    const detail = agile.buildSprintDetail({
        project,
        sprintNumber: 1,
        tasks: [
            task({ id: 1, weight: 0.05, pct_complete: 100 }),
            task({ id: 2, weight: 0.03, pct_complete: 0 }),
        ],
        dailyActuals: [{ task_id: 1, entry_date: '2026-03-04', pct_complete: 100 }],
        personnel: [],
        cadenceDays: 14,
        now: at('2026-03-10'),
    });

    assert.equal(detail.sprint.number, 1);
    assert.equal(detail.sprint.total_sprints, 3);
    assert.deepEqual(Object.keys(detail.columns), ['todo', 'in_progress', 'at_risk', 'done']);
    assert.equal(detail.columns.done.length, 1);
    assert.equal(detail.columns.todo.length, 1);
    assert.ok(detail.burndown.days.length > 0);
});

test('buildSprintDetail returns null outside the project window', () => {
    const detail = agile.buildSprintDetail({
        project, sprintNumber: 99, tasks: [], cadenceDays: 14, now: at('2026-03-10'),
    });

    assert.equal(detail, null);
});
