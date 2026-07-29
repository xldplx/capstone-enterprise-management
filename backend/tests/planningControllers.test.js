const test = require('node:test');
const assert = require('node:assert/strict');

function responseRecorder() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function fakeSupabase(seed = {}) {
    const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, structuredClone(rows)]));
    const operations = [];

    class Query {
        constructor(table) {
            this.table = table;
            this.action = 'select';
            this.payload = null;
            this.filters = [];
            this.singleRow = false;
            this.promise = null;
        }

        select() { return this; }
        order() { return this; }
        limit() { return this; }
        eq(field, value) { this.filters.push([field, value]); return this; }
        insert(payload) { this.action = 'insert'; this.payload = structuredClone(payload); return this; }
        update(payload) { this.action = 'update'; this.payload = structuredClone(payload); return this; }
        delete() { this.action = 'delete'; return this; }
        single() { this.singleRow = true; return this.execute(); }
        maybeSingle() { this.singleRow = true; return this.execute(); }
        then(resolve, reject) { return this.execute().then(resolve, reject); }

        matches(row) {
            return this.filters.every(([field, value]) => String(row[field]) === String(value));
        }

        execute() {
            if (this.promise) return this.promise;
            this.promise = Promise.resolve().then(() => {
                operations.push({
                    table: this.table,
                    action: this.action,
                    payload: structuredClone(this.payload),
                    filters: structuredClone(this.filters),
                });
                const rows = tables[this.table] || (tables[this.table] = []);

                if (this.action === 'insert') {
                    const inserted = Array.isArray(this.payload) ? this.payload : [this.payload];
                    rows.push(...structuredClone(inserted));
                    return { data: this.singleRow ? inserted[0] : inserted, error: null };
                }

                const matched = rows.filter(row => this.matches(row));
                if (this.action === 'update') {
                    matched.forEach(row => Object.assign(row, this.payload));
                    return { data: this.singleRow ? matched[0] || null : structuredClone(matched), error: null };
                }
                if (this.action === 'delete') {
                    tables[this.table] = rows.filter(row => !this.matches(row));
                    return { data: null, error: null };
                }
                return { data: this.singleRow ? structuredClone(matched[0] || null) : structuredClone(matched), error: null };
            });
            return this.promise;
        }
    }

    return {
        operations,
        tables,
        from(table) { return new Query(table); },
    };
}

function installMock(modulePath, exports) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };
}

function loadTasksController({ supabase, requirePlanningUnlocked, writeAudit = async () => {} }) {
    const controllerPath = require.resolve('../controllers/tasksController');
    installMock(require.resolve('../config/db'), supabase);
    installMock(require.resolve('../services/planningLockService'), { requirePlanningUnlocked });
    installMock(require.resolve('../controllers/auditController'), { writeAudit });
    delete require.cache[controllerPath];
    return require(controllerPath);
}

function loadReadinessController(supabase) {
    const controllerPath = require.resolve('../controllers/planningReadinessController');
    installMock(require.resolve('../config/db'), supabase);
    delete require.cache[controllerPath];
    return require(controllerPath);
}

const project = {
    id: 1,
    project_name: 'Delivery',
    planned_start: '2026-01-01',
    planned_end: '2026-01-31',
    total_budget: 200,
};
const wbs = [{ id: 10, project_id: 1, wbs_code: '1.1', name: 'Delivery' }];

function plannedTask(overrides = {}) {
    return {
        id: 1,
        project_id: 1,
        wbs_id: 10,
        wbs_code: '1.1',
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

test('baseline controller rejects blockers before any write', async () => {
    const supabase = fakeSupabase({ projects: [project], wbs, tasks: [plannedTask({ weight: 0.5 })], baselines: [] });
    const controller = loadTasksController({ supabase, requirePlanningUnlocked: async () => {} });
    const response = responseRecorder();

    await controller.lockBaseline({ params: { projectId: '1' }, body: {}, user: { username: 'pm' } }, response);

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'PLAN_NOT_READY');
    assert.equal(supabase.operations.some(operation => operation.action !== 'select'), false);
});

test('baseline controller permits warnings and audits accepted warning codes', async () => {
    const tasks = [
        plannedTask({ id: 1, weight: 0.5 }),
        plannedTask({ id: 2, task_name: 'Task 2', weight: 0.5, planned_start: '2026-01-06', planned_end: '2026-01-10' }),
    ];
    const supabase = fakeSupabase({ projects: [project], wbs, tasks, baselines: [] });
    const audits = [];
    const controller = loadTasksController({
        supabase,
        requirePlanningUnlocked: async () => {},
        writeAudit: async (...args) => audits.push(args),
    });
    const response = responseRecorder();

    await controller.lockBaseline({
        params: { projectId: '1' }, body: { baseline_name: 'Approved plan' },
        user: { username: 'pm' }, headers: {},
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.readiness.state, 'ready_with_warnings');
    assert.equal(supabase.operations.some(operation => operation.table === 'baselines' && operation.action === 'insert'), true);
    assert.equal(audits.length, 1);
    assert.equal(audits[0][1], 'LOCK');
    assert.equal(audits[0][2], 'baseline');
    assert.deepEqual(audits[0][4].accepted_warning_codes, ['NO_DEPENDENCY_NETWORK']);
    assert.equal(audits[0][4].readiness_state, 'ready_with_warnings');
});

test('repeated baseline lock fails before loading or writing planning data', async () => {
    const supabase = fakeSupabase({ projects: [project], wbs, tasks: [plannedTask()], baselines: [{ project_id: 1 }] });
    const lockedError = Object.assign(new Error('Already locked.'), { statusCode: 409, code: 'BASELINE_LOCKED' });
    const controller = loadTasksController({ supabase, requirePlanningUnlocked: async () => { throw lockedError; } });
    const response = responseRecorder();

    await controller.lockBaseline({ params: { projectId: '1' }, body: {}, user: { username: 'pm' } }, response);

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'BASELINE_LOCKED');
    assert.equal(supabase.operations.length, 0);
});

test('planning task updates are rejected after lock while actual updates continue', async () => {
    const lockedError = Object.assign(new Error('Planning locked.'), { statusCode: 409, code: 'BASELINE_LOCKED' });
    let lockChecks = 0;
    const supabase = fakeSupabase({ tasks: [plannedTask()] });
    const controller = loadTasksController({
        supabase,
        requirePlanningUnlocked: async () => { lockChecks += 1; throw lockedError; },
    });

    const planningResponse = responseRecorder();
    await controller.updateTask({ params: { id: '1' }, body: { planned_cost: 125 } }, planningResponse);
    assert.equal(planningResponse.statusCode, 409);
    assert.equal(planningResponse.body.code, 'BASELINE_LOCKED');
    assert.equal(supabase.operations.some(operation => operation.action === 'update'), false);

    const actualResponse = responseRecorder();
    await controller.updateTask({ params: { id: '1' }, body: { actual_cost: 25, actual_hours: 2, pct_complete: 0.2 } }, actualResponse);
    assert.equal(actualResponse.statusCode, 200);
    assert.equal(actualResponse.body.data.actual_cost, 25);
    assert.equal(lockChecks, 1);
});

test('dependency preview reads project data without insert, update or delete', async () => {
    const tasks = [
        plannedTask({ id: 1, weight: 0.5, planned_end: '2026-01-08' }),
        plannedTask({ id: 2, weight: 0.5, task_name: 'Task 2', planned_start: '2026-01-05', planned_end: '2026-01-10', predecessors: [1] }),
    ];
    const supabase = fakeSupabase({ projects: [project], wbs, tasks });
    const controller = loadReadinessController(supabase);
    const response = responseRecorder();

    await controller.previewDependency({
        params: { projectId: '1' },
        body: { predecessorId: 1, successorId: 2, remedy: 'shift_successor_chain' },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.persisted, false);
    assert.ok(response.body.data.changes.length > 0);
    assert.equal(supabase.operations.every(operation => operation.action === 'select'), true);
});
