const test = require('node:test');
const assert = require('node:assert/strict');

const agile = require('../services/agileService');
const { parseUtcDay } = require('../services/planningReadinessService');

// Helpers take `today` explicitly so these tests do not drift with the clock.
// Midday UTC keeps the Asia/Jakarta (UTC+7) conversion inside the same day.
const day = (iso) => parseUtcDay(iso);
const at  = (iso) => new Date(`${iso}T12:00:00Z`);

const sprint = {
    id: 1, project_id: 1, sprint_number: 1, name: 'Sprint 1',
    start_date: '2026-03-02', end_date: '2026-03-06', status: 'active',
};

function task(overrides = {}) {
    return {
        id: 1,
        task_name: 'Excavation Works',
        wbs_code: '1.1',
        wbs_id: 10,
        planned_start: '2026-03-02',
        planned_end:   '2026-03-06',
        planned_hours: 40,
        actual_hours:  0,
        weight:        0.05,
        pct_complete:  0,
        sprint_id:     1,
        board_status:  'todo',
        story_points:  5,
        assignee_id:   null,
        blocked_reason: null,
        completed_at:  null,
        ...overrides,
    };
}

// ── Estimation ───────────────────────────────────────────────────────────────

test('weight suggests points on the fibonacci scale as a percentage of project', () => {
    assert.equal(agile.suggestStoryPoints({ weight: 0.05 }), 5);
    assert.equal(agile.suggestStoryPoints({ weight: 0.13 }), 13);
    assert.equal(agile.suggestStoryPoints({ weight: 0.01 }), 1);
    assert.equal(agile.suggestStoryPoints({ weight: 0.20 }), 21);
    assert.equal(agile.suggestStoryPoints({ weight: '0.05' }), 5); // PostgREST numeric string
});

test('a task with no weight has nothing to suggest', () => {
    assert.equal(agile.suggestStoryPoints({ weight: 0 }), null);
    assert.equal(agile.suggestStoryPoints({ weight: null }), null);
});

test('a suggestion is only offered while the story is unsized', () => {
    const sized   = agile.toCard(task({ story_points: 8, weight: 0.05 }), { today: day('2026-03-03') });
    const unsized = agile.toCard(task({ story_points: null, weight: 0.05 }), { today: day('2026-03-03') });

    assert.equal(sized.story_points, 8);
    assert.equal(sized.suggested_points, null);
    assert.equal(unsized.story_points, null);
    assert.equal(unsized.suggested_points, 5);
});

// ── Cards ────────────────────────────────────────────────────────────────────

test('cards carry board state, float and the assignee name', () => {
    const personnelById = new Map([[7, { id: 7, full_name: 'Budi Santoso' }]]);
    const card = agile.toCard(
        task({ assignee_id: 7, board_status: 'review', planned_end: '2026-03-20' }),
        { personnelById, today: day('2026-03-10') },
    );

    assert.equal(card.board_status, 'review');
    assert.equal(card.assignee_name, 'Budi Santoso');
    assert.equal(card.float, 10);
    assert.equal(card.days_overdue, 0);
});

test('overdue is a decoration, not a column, and never applies to done work', () => {
    const overdue = agile.toCard(task({ planned_end: '2026-03-05', board_status: 'in_progress' }), { today: day('2026-03-10') });
    const doneLate = agile.toCard(task({ planned_end: '2026-03-05', board_status: 'done' }), { today: day('2026-03-10') });

    assert.equal(overdue.board_status, 'in_progress'); // the column is unchanged
    assert.equal(overdue.days_overdue, 5);
    assert.equal(overdue.float, 0);                    // clamped, per the app convention
    assert.equal(doneLate.days_overdue, 0);
});

// ── Board writes / reconciliation ────────────────────────────────────────────

const NOW = '2026-03-04T00:00:00.000Z';

test('moving a card to done completes it and stamps the time', () => {
    const updates = agile.reconcileAgileUpdate(task({ pct_complete: 40 }), { board_status: 'done' }, NOW);

    assert.equal(updates.board_status, 'done');
    assert.equal(updates.pct_complete, 100);
    assert.equal(updates.completed_at, NOW);
});

test('reporting 100 percent moves the card to done without being told', () => {
    const updates = agile.reconcileAgileUpdate(task(), { pct_complete: 100 }, NOW);

    assert.equal(updates.board_status, 'done');
    assert.equal(updates.completed_at, NOW);
});

test('reopening clears the completion but never invents a percentage', () => {
    const existing = task({ board_status: 'done', pct_complete: 100, completed_at: NOW });
    const updates  = agile.reconcileAgileUpdate(existing, { board_status: 'in_progress', pct_complete: 60 }, NOW);

    assert.equal(updates.board_status, 'in_progress');
    assert.equal(updates.completed_at, null);
    assert.equal(updates.pct_complete, 60);
});

test('re-saving a done story keeps its original completion date', () => {
    const existing = task({ board_status: 'done', pct_complete: 100, completed_at: '2026-03-01T00:00:00.000Z' });
    const updates  = agile.reconcileAgileUpdate(existing, { assignee_id: 3 }, NOW);

    assert.equal(updates.completed_at, undefined); // untouched
    assert.equal(updates.assignee_id, 3);
});

test('a blocked story must say why, and leaving blocked clears the reason', () => {
    assert.throws(
        () => agile.reconcileAgileUpdate(task(), { board_status: 'blocked' }, NOW),
        /blocked story needs a reason/i,
    );

    const blocked = agile.reconcileAgileUpdate(task(), { board_status: 'blocked', blocked_reason: 'Awaiting rebar delivery' }, NOW);
    assert.equal(blocked.blocked_reason, 'Awaiting rebar delivery');

    const unblocked = agile.reconcileAgileUpdate(
        task({ board_status: 'blocked', blocked_reason: 'Awaiting rebar delivery' }),
        { board_status: 'in_progress' }, NOW,
    );
    assert.equal(unblocked.blocked_reason, null);
});

test('pulling a story out of a sprint returns it to the product backlog', () => {
    const updates = agile.reconcileAgileUpdate(task({ board_status: 'in_progress' }), { sprint_id: null }, NOW);

    assert.equal(updates.sprint_id, null);
    assert.equal(updates.board_status, 'backlog');
});

test('committing a backlog story to a sprint puts it on the board', () => {
    const existing = task({ sprint_id: null, board_status: 'backlog' });
    const updates  = agile.reconcileAgileUpdate(existing, { sprint_id: 4 }, NOW);

    assert.equal(updates.sprint_id, 4);
    assert.equal(updates.board_status, 'todo');
});

test('invalid board state and percentages are refused', () => {
    assert.throws(() => agile.reconcileAgileUpdate(task(), { board_status: 'shipped' }, NOW), /Board status must be one of/);
    assert.throws(() => agile.reconcileAgileUpdate(task(), { pct_complete: 140 }, NOW), /between 0 and 100/);
    assert.throws(() => agile.reconcileAgileUpdate(task(), { story_points: -3 }, NOW), /zero or more/);
});

test('story points can be cleared back to unsized', () => {
    assert.equal(agile.reconcileAgileUpdate(task(), { story_points: null }, NOW).story_points, null);
    assert.equal(agile.reconcileAgileUpdate(task(), { story_points: 13 }, NOW).story_points, 13);
});

// ── Sprint validation ────────────────────────────────────────────────────────

test('a sprint needs a name and a sane date window', () => {
    assert.throws(() => agile.normalizeSprintPayload({ name: '  ', start_date: '2026-03-02', end_date: '2026-03-15' }), /name is required/i);
    assert.throws(() => agile.normalizeSprintPayload({ name: 'S1', start_date: '2026-03-15', end_date: '2026-03-02' }), /cannot end before it starts/i);
    assert.throws(() => agile.normalizeSprintPayload({ name: 'S1' }), /start and end dates are required/i);

    const ok = agile.normalizeSprintPayload({ name: ' Foundations ', goal: ' Pour footings ', start_date: '2026-03-02', end_date: '2026-03-15' });
    assert.equal(ok.name, 'Foundations');
    assert.equal(ok.goal, 'Pour footings');
});

test('overlapping sprint windows are detected, ignoring cancelled ones', () => {
    const others = [
        { id: 1, name: 'Sprint 1', start_date: '2026-03-02', end_date: '2026-03-15', status: 'completed' },
        { id: 2, name: 'Sprint 2', start_date: '2026-03-16', end_date: '2026-03-29', status: 'cancelled' },
    ];

    assert.equal(agile.findOverlappingSprint({ start_date: '2026-03-10', end_date: '2026-03-20' }, others)?.id, 1);
    // Lands entirely inside the cancelled window, so it is free.
    assert.equal(agile.findOverlappingSprint({ start_date: '2026-03-16', end_date: '2026-03-25' }, others), null);
    assert.equal(agile.findOverlappingSprint({ start_date: '2026-03-30', end_date: '2026-04-10' }, others), null);
});

// ── Sprint metrics ───────────────────────────────────────────────────────────

test('sprint metrics roll points up by board column', () => {
    const tasks = [
        task({ id: 1, story_points: 5,  board_status: 'done', pct_complete: 100 }),
        task({ id: 2, story_points: 13, board_status: 'in_progress', pct_complete: 50 }),
        task({ id: 3, story_points: 3,  board_status: 'blocked', blocked_reason: 'Rain' }),
    ];

    const metrics = agile.computeSprintMetrics(tasks, day('2026-03-04'));

    assert.equal(metrics.committed_points, 21);
    assert.equal(metrics.completed_points, 5);
    assert.equal(metrics.remaining_points, 16);
    assert.equal(metrics.blocked_tasks, 1);
    assert.equal(metrics.counts.done, 1);
});

test('unsized stories are counted and completion falls back to card count', () => {
    const tasks = [
        task({ id: 1, story_points: null, board_status: 'done', pct_complete: 100 }),
        task({ id: 2, story_points: null, board_status: 'todo' }),
    ];
    const metrics = agile.computeSprintMetrics(tasks, day('2026-03-04'));

    assert.equal(metrics.unestimated_tasks, 2);
    assert.equal(metrics.committed_points, 0);
    assert.equal(metrics.completion_pct, 50);
});

test('an empty sprint reports zeroes, not NaN', () => {
    const metrics = agile.computeSprintMetrics([], day('2026-03-04'));
    assert.equal(metrics.committed_points, 0);
    assert.equal(metrics.completion_pct, 0);
});

// ── Burndown ─────────────────────────────────────────────────────────────────

test('burndown burns exactly on the day each story completed', () => {
    const tasks = [
        task({ id: 1, story_points: 5, board_status: 'done', pct_complete: 100, completed_at: '2026-03-03T08:00:00Z' }),
        task({ id: 2, story_points: 3, board_status: 'done', pct_complete: 100, completed_at: '2026-03-05T08:00:00Z' }),
    ];

    const { days, committed_points } = agile.computeBurndown(sprint, tasks, [], day('2026-03-06'));

    assert.equal(committed_points, 8);
    assert.deepEqual(days.map(d => d.remaining), [8, 3, 3, 0, 0]);
});

test('partial progress from the ledger burns down proportionally', () => {
    const tasks  = [task({ id: 1, story_points: 8, board_status: 'in_progress', pct_complete: 50 })];
    const ledger = [{ task_id: 1, entry_date: '2026-03-03', pct_complete: 50 }];

    const { days } = agile.computeBurndown(sprint, tasks, ledger, day('2026-03-04'));

    assert.equal(days[0].remaining, 8);
    assert.equal(days[1].remaining, 4);
    assert.equal(days[2].remaining, 4);
});

test('an out-of-order ledger is sorted before it is read', () => {
    const tasks  = [task({ id: 1, story_points: 8, pct_complete: 75 })];
    const ledger = [
        { task_id: 1, entry_date: '2026-03-05', pct_complete: 75 },
        { task_id: 1, entry_date: '2026-03-03', pct_complete: 25 },
    ];

    const { days } = agile.computeBurndown(sprint, tasks, ledger, day('2026-03-06'));
    assert.deepEqual(days.map(d => d.remaining), [8, 6, 6, 2, 2]);
});

test('the ideal line runs from the committed total to zero', () => {
    const { days } = agile.computeBurndown(sprint, [task({ story_points: 8 })], [], day('2026-03-02'));
    assert.deepEqual(days.map(d => d.ideal), [8, 6, 4, 2, 0]);
});

test('days after today are null so the chart does not imply a stall', () => {
    const { days } = agile.computeBurndown(sprint, [task({ story_points: 8 })], [], day('2026-03-03'));

    assert.equal(days[1].remaining, 8);
    assert.deepEqual(days.slice(2).map(d => d.remaining), [null, null, null]);
    assert.ok(days.every(d => d.ideal !== null)); // the plan still runs the full window
});

test('a sprint with nothing estimated burns down flat at zero', () => {
    const { days, committed_points } = agile.computeBurndown(
        sprint, [task({ story_points: null })], [], day('2026-03-06'));

    assert.equal(committed_points, 0);
    assert.deepEqual(days.map(d => d.remaining), [0, 0, 0, 0, 0]);
});

test('a sprint without dates yields an empty burndown rather than throwing', () => {
    assert.deepEqual(agile.computeBurndown({}, [task()], [], day('2026-03-06')), { days: [], committed_points: 0 });
});

// ── Velocity ─────────────────────────────────────────────────────────────────

test('velocity credits a sprint only for stories finished by its own end date', () => {
    const sprints = [{ ...sprint, status: 'completed' }];
    const bySprint = new Map([[1, [
        task({ id: 1, story_points: 5, board_status: 'done', completed_at: '2026-03-04T00:00:00Z' }),
        // Finished a week after the sprint closed — must not be credited.
        task({ id: 2, story_points: 8, board_status: 'done', completed_at: '2026-03-13T00:00:00Z' }),
    ]]]);

    const velocity = agile.computeVelocity(sprints, bySprint, day('2026-03-20'));

    assert.equal(velocity.history[0].committed_points, 13);
    assert.equal(velocity.history[0].completed_points, 5);
    assert.equal(velocity.average_points, 5);
});

test('velocity with no finished sprints averages zero rather than dividing by zero', () => {
    const velocity = agile.computeVelocity([{ ...sprint, status: 'active' }], new Map(), day('2026-03-04'));

    assert.deepEqual(velocity.history, []);
    assert.equal(velocity.average_points, 0);
    assert.equal(velocity.sprints_measured, 0);
});

// ── Capacity ─────────────────────────────────────────────────────────────────

test('working days exclude weekends', () => {
    assert.equal(agile.workingDays('2026-03-02', '2026-03-15'), 10); // Mon-Sun x2
    assert.equal(agile.workingDays('2026-03-07', '2026-03-08'), 0);  // Sat + Sun
});

test('capacity flags an over-committed sprint and ignores inactive people', () => {
    const personnel = [{ status: 'active' }, { status: 'active' }, { status: 'inactive' }];
    const capacity  = agile.computeCapacity(sprint, personnel, { planned_hours: 100 });

    assert.equal(capacity.headcount, 2);
    assert.equal(capacity.working_days, 5);
    assert.equal(capacity.available_hours, 80); // 2 people x 5 days x 8h
    assert.equal(capacity.over_committed, true);
});

test('capacity with no personnel reports no percentage instead of infinity', () => {
    const capacity = agile.computeCapacity(sprint, [], { planned_hours: 100 });
    assert.equal(capacity.used_pct, null);
    assert.equal(capacity.over_committed, false);
});

// ── Backlog grouped by WBS ───────────────────────────────────────────────────

const wbsNodes = [
    { id: 10, wbs_code: '1.1', name: 'Substructure' },
    { id: 20, wbs_code: '1.2', name: 'Superstructure' },
];

test('the backlog groups uncommitted stories under their WBS node', () => {
    const tasks = [
        task({ id: 1, sprint_id: 1 }),                                    // committed — excluded
        task({ id: 2, sprint_id: null, wbs_id: 10, story_points: 3 }),
        task({ id: 3, sprint_id: null, wbs_id: 20, story_points: 8 }),
        task({ id: 4, sprint_id: null, wbs_id: 20, pct_complete: 100 }),  // finished — excluded
    ];

    const backlog = agile.buildBacklog(tasks, wbsNodes, day('2026-03-04'));

    assert.equal(backlog.length, 2);
    assert.equal(backlog[0].wbs_code, '1.1');
    assert.equal(backlog[0].name, 'Substructure');
    assert.equal(backlog[0].points, 3);
    assert.deepEqual(backlog[1].tasks.map(t => t.id), [3]);
});

test('backlog stories are ordered by urgency within their node', () => {
    const tasks = [
        task({ id: 1, sprint_id: null, wbs_id: 10, planned_end: '2026-03-20', story_points: 3 }),
        task({ id: 2, sprint_id: null, wbs_id: 10, planned_end: '2026-03-01', story_points: 1 }), // overdue
        task({ id: 3, sprint_id: null, wbs_id: 10, planned_end: '2026-03-08', story_points: 5 }),
    ];

    const [group] = agile.buildBacklog(tasks, wbsNodes, day('2026-03-10'));
    assert.deepEqual(group.tasks.map(t => t.id), [2, 3, 1]);
});

test('stories with no WBS node still appear, grouped as unassigned', () => {
    const tasks = [task({ id: 1, sprint_id: null, wbs_id: null, wbs_code: null })];
    const backlog = agile.buildBacklog(tasks, wbsNodes, day('2026-03-04'));

    assert.equal(backlog.length, 1);
    assert.equal(backlog[0].wbs_id, null);
});

// ── Composition ──────────────────────────────────────────────────────────────

test('buildOverview summarises sprints and picks the active one', () => {
    const overview = agile.buildOverview({
        sprints: [
            { ...sprint, id: 1, status: 'completed', sprint_number: 1 },
            { ...sprint, id: 2, status: 'active', sprint_number: 2, start_date: '2026-03-09', end_date: '2026-03-13' },
        ],
        tasks: [
            task({ id: 1, sprint_id: 1, story_points: 5, board_status: 'done', completed_at: '2026-03-04T00:00:00Z' }),
            task({ id: 2, sprint_id: 2, story_points: 8, board_status: 'todo' }),
            task({ id: 3, sprint_id: null, story_points: null }),
        ],
        wbsNodes,
        personnel: [{ status: 'active' }],
        now: at('2026-03-10'),
    });

    assert.equal(overview.active_sprint, 2);
    assert.equal(overview.sprints[0].metrics.completed_points, 5);
    assert.equal(overview.velocity.history.length, 1);
    assert.equal(overview.backlog.length, 1);
    assert.equal(overview.unestimated_committed, 0); // the unsized story is not committed
    assert.ok(overview.capacity);
});

test('buildSprintDetail returns the five board columns and a burndown', () => {
    const detail = agile.buildSprintDetail({
        sprint,
        tasks: [
            task({ id: 1, sprint_id: 1, board_status: 'done', story_points: 5, completed_at: '2026-03-03T00:00:00Z' }),
            task({ id: 2, sprint_id: 1, board_status: 'review', story_points: 3 }),
            task({ id: 3, sprint_id: 99, board_status: 'todo' }), // another sprint — excluded
        ],
        personnel: [],
        now: at('2026-03-04'),
    });

    assert.deepEqual(Object.keys(detail.columns), ['todo', 'in_progress', 'review', 'blocked', 'done']);
    assert.equal(detail.columns.done.length, 1);
    assert.equal(detail.columns.review.length, 1);
    assert.equal(detail.metrics.task_count, 2);
    assert.ok(detail.burndown.days.length > 0);
});

test('buildSprintDetail returns null without a sprint', () => {
    assert.equal(agile.buildSprintDetail({ sprint: null, tasks: [] }), null);
});
