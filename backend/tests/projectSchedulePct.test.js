const test = require('node:test');
const assert = require('node:assert/strict');

const { schedulePctFromTasks, withSchedulePct } = require('../controllers/projectsController');

// UTC-day timestamps, matching parseUtcDay — a local `new Date('...T00:00:00')`
// would sit 7 hours off in UTC+7 and skew every fraction.
const day = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const task = (overrides = {}) => ({
    planned_cost: 100,
    planned_start: '2026-01-01',
    planned_end: '2026-01-11',
    ...overrides,
});

test('planned value is zero before any task starts and one after all finish', () => {
    const tasks = [task()];
    assert.equal(schedulePctFromTasks(tasks, day('2025-12-01')), 0);
    assert.equal(schedulePctFromTasks(tasks, day('2026-06-01')), 1);
});

test('a single task reports its own elapsed fraction', () => {
    // 10-day span, 5 days elapsed
    assert.equal(schedulePctFromTasks([task()], day('2026-01-06')), 0.5);
});

// The reason PV must be time-phased rather than a straight line: a cheap task
// finishing early and an expensive one starting later are not 50% planned just
// because half the calendar has passed.
test('planned value is weighted by planned cost, not by task count', () => {
    const tasks = [
        task({ planned_cost: 10,   planned_start: '2026-01-01', planned_end: '2026-01-11' }), // done
        task({ planned_cost: 990,  planned_start: '2026-02-01', planned_end: '2026-02-11' }), // not started
    ];
    const pct = schedulePctFromTasks(tasks, day('2026-01-15'));
    assert.equal(pct, 0.01);                 // 10/1000, not 0.5
    assert.ok(pct < 0.5, 'cost weighting must dominate task count');
});

test('tasks with no dates carry no planned value but still count toward the budget', () => {
    const tasks = [
        task({ planned_cost: 100, planned_start: null, planned_end: null }),
        task({ planned_cost: 100, planned_start: '2026-01-01', planned_end: '2026-01-11' }),
    ];
    // second task complete, first has no schedule -> 100/200
    assert.equal(schedulePctFromTasks(tasks, day('2026-02-01')), 0.5);
});

test('a zero-duration milestone flips from 0 to 1 on its date', () => {
    const milestone = [task({ planned_start: '2026-01-10', planned_end: '2026-01-10' })];
    assert.equal(schedulePctFromTasks(milestone, day('2026-01-09')), 0);
    assert.equal(schedulePctFromTasks(milestone, day('2026-01-10')), 1);
});

test('returns null when there is nothing to plan against, so callers can fall back', () => {
    assert.equal(schedulePctFromTasks([], day('2026-01-06')), null);
    assert.equal(schedulePctFromTasks([task({ planned_cost: 0 })], day('2026-01-06')), null);
});

// The bug this replaces: PV = BAC * 0 made SPI null on every project.
test('a mid-flight project yields a usable SPI instead of null', () => {
    const tasks = [task({ planned_cost: 1000 })];
    const schedulePct = schedulePctFromTasks(tasks, day('2026-01-06'));
    const BAC = 1000, EV = 400;
    const PV = BAC * schedulePct;
    assert.equal(PV, 500);
    assert.equal(PV > 0 ? EV / PV : null, 0.8);
});

// Existing projects were seeded with schedule_pct values. Recomputing over the
// top of them would move CPI/SPI on dashboards that were already correct.
test('a stored schedule_pct is left alone', () => {
    const tasks = [task({ planned_cost: 1000 })];
    const project = { id: 1, schedule_pct: 0.22 };
    assert.equal(withSchedulePct(project, tasks).schedule_pct, 0.22);
});

test('a project with no usable schedule_pct gets the derived one', () => {
    const tasks = [task({ planned_cost: 1000, planned_start: '2020-01-01', planned_end: '2020-01-11' })];
    for (const stored of [0, null, undefined, '']) {
        const result = withSchedulePct({ id: 1, schedule_pct: stored }, tasks);
        assert.equal(result.schedule_pct, 1, `stored ${JSON.stringify(stored)} should derive`);
    }
});

test('a project with no costed tasks is returned untouched', () => {
    const project = { id: 1, schedule_pct: 0 };
    assert.equal(withSchedulePct(project, []), project);
});

test('derived planned value uses the Jakarta calendar day near UTC midnight', () => {
    const RealDate = global.Date;
    global.Date = class extends RealDate {
        constructor(...args) {
            super(...(args.length ? args : ['2026-04-02T00:30:00+07:00']));
        }
    };

    try {
        const result = withSchedulePct({ id: 1, schedule_pct: 0 }, [task({
            planned_start: '2026-04-01',
            planned_end: '2026-04-03',
        })]);
        assert.equal(result.schedule_pct, 0.5);
    } finally {
        global.Date = RealDate;
    }
});
