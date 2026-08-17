/**
 * agileService.js — sprint, board and delivery-metric logic.
 *
 * Correction #3 implements Agile as a HYBRID over the existing plan rather than
 * beside it. Sprints are real rows in `sprints`; membership, board state, points,
 * assignee and completion are real columns on `tasks`. That means one task row is
 * simultaneously a CPM activity (WBS code, predecessors, planned dates, float)
 * and a board card — so EVM, the critical path and the baseline lock keep working
 * untouched, and the board is a second view over the same rows.
 *
 * Two axes over one row:
 *   WBS    answers "what"          — scope decomposition
 *   sprint answers "when we commit" — a time-boxed delivery commitment
 *
 * Everything here is a pure function over plain objects, so the whole module is
 * testable with `node --test` while the schema lives in Supabase.
 */

const { parseUtcDay } = require('./planningReadinessService');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS_PER_PERSON_DAY = 8;

// Every value board_status may hold. 'backlog' is the product backlog pool, not
// a board column — the board shows work already committed to a sprint.
const TASK_BOARD_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done', 'blocked'];
const BOARD_COLUMNS       = ['todo', 'in_progress', 'review', 'blocked', 'done'];
const SPRINT_STATUSES     = ['planning', 'active', 'completed', 'cancelled'];

// Story points are relative sizing, and so is `weight`. A weight of 0.05 is 5%
// of the project, which maps onto the Fibonacci scale as 5 points. Used only to
// SUGGEST an estimate for an unsized story — once set, story_points is owned
// independently, which matters because weight is frozen by the baseline lock.
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

const num = (value) => parseFloat(value) || 0;

function round2(value) {
    return Math.round(value * 100) / 100;
}

function formatUtcDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

function badRequest(message, code) {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = code;
    return error;
}

/**
 * "Today" as a UTC-day timestamp, read in Asia/Jakarta the same way
 * tasksController and projectsController do. Sharing the convention keeps the
 * board, the float column and EVM from disagreeing about what day it is.
 */
function utcToday(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(part => [part.type, part.value]));
    return parseUtcDay(`${parts.year}-${parts.month}-${parts.day}`);
}

// ── Estimation ───────────────────────────────────────────────────────────────

/** Suggested points for an unsized story, from its planning weight. */
function suggestStoryPoints(task = {}) {
    const weight = num(task.weight);
    if (weight <= 0) return null;
    const raw = weight * 100;
    return FIBONACCI.reduce((best, candidate) =>
        Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best);
}

function pointsOf(task = {}) {
    const stored = task.story_points;
    if (stored === null || stored === undefined || stored === '') return null;
    const parsed = parseFloat(stored);
    return Number.isFinite(parsed) ? parsed : null;
}

// ── Sprint payload validation ────────────────────────────────────────────────

function normalizeSprintPayload(body = {}, { partial = false } = {}) {
    const out = {};
    const has = field => body[field] !== undefined;
    const required = field => !partial || has(field);

    if (required('name')) {
        const name = String(body.name ?? '').trim();
        if (!name) throw badRequest('Sprint name is required.', 'SPRINT_NAME_REQUIRED');
        out.name = name;
    }

    if (required('start_date') || required('end_date') || has('start_date') || has('end_date')) {
        const start = parseUtcDay(body.start_date);
        const end   = parseUtcDay(body.end_date);
        if (start == null || end == null)
            throw badRequest('Sprint start and end dates are required, as YYYY-MM-DD.', 'SPRINT_DATES_REQUIRED');
        if (end < start)
            throw badRequest('A sprint cannot end before it starts.', 'SPRINT_DATES_INVALID');
        out.start_date = formatUtcDay(start);
        out.end_date   = formatUtcDay(end);
    }

    if (has('goal')) out.goal = String(body.goal ?? '').trim() || null;

    if (has('status')) {
        if (!SPRINT_STATUSES.includes(body.status))
            throw badRequest(`Sprint status must be one of: ${SPRINT_STATUSES.join(', ')}.`, 'SPRINT_STATUS_INVALID');
        out.status = body.status;
    }

    return out;
}

/**
 * Sprint windows within a project must not overlap — two sprints running over
 * the same days makes velocity and burndown meaningless. `others` is every
 * OTHER sprint of the project (exclude the one being edited).
 */
function findOverlappingSprint(candidate, others = []) {
    const start = parseUtcDay(candidate.start_date);
    const end   = parseUtcDay(candidate.end_date);
    if (start == null || end == null) return null;

    return others.find(other => {
        if (other.status === 'cancelled') return false;
        const otherStart = parseUtcDay(other.start_date);
        const otherEnd   = parseUtcDay(other.end_date);
        if (otherStart == null || otherEnd == null) return false;
        return start <= otherEnd && otherStart <= end;
    }) || null;
}

// ── Board writes ─────────────────────────────────────────────────────────────

/**
 * Build the database patch for an agile update on a task.
 *
 * These fields are DELIVERY decisions, not planning ones, so callers must not
 * put them through requirePlanningUnlocked — a frozen baseline should stop the
 * dates moving, not stop the team working the board.
 *
 * Reconciliation, so the board and EVM can never contradict each other:
 *   board_status -> done  : pct_complete becomes 100, completed_at stamped
 *   pct_complete -> 100   : board_status becomes done, completed_at stamped
 *   done -> anything else : completed_at cleared
 *
 * Reopening deliberately does NOT rewrite pct_complete. The board has no idea
 * how much of a reopened task is really finished, and inventing a number would
 * corrupt earned value; the real figure is entered on Daily Actuals.
 */
function reconcileAgileUpdate(existing = {}, patch = {}, now = new Date().toISOString()) {
    const updates = {};

    if (patch.board_status !== undefined) {
        if (!TASK_BOARD_STATUSES.includes(patch.board_status))
            throw badRequest(`Board status must be one of: ${TASK_BOARD_STATUSES.join(', ')}.`, 'BOARD_STATUS_INVALID');
        updates.board_status = patch.board_status;
    }

    if (patch.story_points !== undefined) {
        const value = patch.story_points === null || patch.story_points === '' ? null : Number(patch.story_points);
        if (value !== null && (!Number.isFinite(value) || value < 0))
            throw badRequest('Story points must be zero or more.', 'STORY_POINTS_INVALID');
        updates.story_points = value;
    }

    if (patch.sprint_id !== undefined)
        updates.sprint_id = patch.sprint_id === null || patch.sprint_id === '' ? null : Number(patch.sprint_id);

    if (patch.assignee_id !== undefined)
        updates.assignee_id = patch.assignee_id === null || patch.assignee_id === '' ? null : Number(patch.assignee_id);

    if (patch.blocked_reason !== undefined)
        updates.blocked_reason = String(patch.blocked_reason ?? '').trim() || null;

    if (patch.pct_complete !== undefined) {
        const value = Number(patch.pct_complete);
        if (!Number.isFinite(value) || value < 0 || value > 100)
            throw badRequest('Percent complete must be between 0 and 100.', 'PCT_COMPLETE_INVALID');
        updates.pct_complete = value;
    }

    const nextStatus = updates.board_status ?? existing.board_status;
    const nextReason = updates.blocked_reason !== undefined ? updates.blocked_reason : existing.blocked_reason;

    // A card cannot sit in 'blocked' without saying why — that is the entire
    // value of the column at a stand-up.
    if (nextStatus === 'blocked' && !nextReason)
        throw badRequest('A blocked story needs a reason.', 'BLOCKED_REASON_REQUIRED');

    // Leaving 'blocked' clears the stale reason so it cannot resurface later.
    if (existing.board_status === 'blocked' && nextStatus !== 'blocked' && updates.blocked_reason === undefined)
        updates.blocked_reason = null;

    // A story cannot be committed to the board without being in a sprint, and a
    // story pulled out of a sprint returns to the product backlog.
    const nextSprint = updates.sprint_id !== undefined ? updates.sprint_id : existing.sprint_id;
    if (nextSprint == null && nextStatus !== 'backlog' && updates.board_status === undefined)
        updates.board_status = 'backlog';
    if (nextSprint != null && nextStatus === 'backlog' && updates.board_status === undefined)
        updates.board_status = 'todo';

    const wasDone = existing.board_status === 'done';
    const pctNow  = updates.pct_complete ?? num(existing.pct_complete);
    const isDone  = (updates.board_status ?? nextStatus) === 'done' || pctNow >= 100;

    if (isDone) {
        updates.board_status = 'done';
        if (updates.pct_complete === undefined && pctNow < 100) updates.pct_complete = 100;
        // Keep the original completion date on a no-op re-save of a done story.
        if (!wasDone || !existing.completed_at) updates.completed_at = now;
    } else if (wasDone) {
        updates.completed_at = null;
    }

    return updates;
}

// ── Cards ────────────────────────────────────────────────────────────────────

/**
 * Days remaining until planned_end. Negative means overdue — the raw sign is
 * what the card needs, so unlike tasksController.computeFloat it is not clamped.
 */
function daysToPlannedEnd(task = {}, today = utcToday()) {
    const end = parseUtcDay(task.planned_end);
    if (end == null) return null;
    return Math.floor((end - today) / DAY_MS);
}

/**
 * Shape a task row into the card the board renders.
 *
 * `at_risk` is a decoration, not a column: it comes from the CPM schedule, so
 * nobody chooses it and dragging cannot clear it. Keeping it visible is what
 * ties the board back to the critical path the rest of the app computes.
 */
function toCard(task = {}, { personnelById = new Map(), today = utcToday() } = {}) {
    const remaining = daysToPlannedEnd(task, today);
    const assignee  = task.assignee_id != null ? personnelById.get(task.assignee_id) : null;
    const status    = TASK_BOARD_STATUSES.includes(task.board_status) ? task.board_status : 'backlog';

    return {
        id:             task.id,
        task_name:      task.task_name,
        wbs_code:       task.wbs_code,
        wbs_id:         task.wbs_id,
        sprint_id:      task.sprint_id ?? null,
        board_status:   status,
        pct_complete:   num(task.pct_complete),
        story_points:   pointsOf(task),
        suggested_points: pointsOf(task) === null ? suggestStoryPoints(task) : null,
        assignee_id:    task.assignee_id ?? null,
        assignee_name:  assignee ? assignee.full_name : null,
        blocked_reason: task.blocked_reason ?? null,
        planned_hours:  num(task.planned_hours),
        actual_hours:   num(task.actual_hours),
        planned_start:  task.planned_start,
        planned_end:    task.planned_end,
        completed_at:   task.completed_at ?? null,
        float:          remaining === null ? null : Math.max(0, remaining),
        days_overdue:   remaining !== null && remaining < 0 && status !== 'done' ? Math.abs(remaining) : 0,
    };
}

// ── Progress ledger ──────────────────────────────────────────────────────────

/**
 * Index `daily_actuals` into task_id -> sorted [{ day, pct }].
 *
 * submitDailyActuals stores pct_complete as the cumulative figure reported that
 * day and rolls the task forward with max(), so reading it back as a running
 * maximum matches how it was written.
 */
function indexProgressLedger(dailyActuals = []) {
    const byTask = new Map();
    for (const row of dailyActuals) {
        const day = parseUtcDay(row.entry_date);
        if (day == null || row.task_id == null) continue;
        const list = byTask.get(row.task_id) ?? [];
        list.push({ day, pct: num(row.pct_complete) });
        byTask.set(row.task_id, list);
    }
    for (const list of byTask.values()) list.sort((a, b) => a.day - b.day);
    return byTask;
}

/** Percent complete of a task as at the end of `day`, from the ledger alone. */
function pctOnDay(ledger, taskId, day) {
    const entries = ledger.get(taskId);
    if (!entries) return 0;
    let best = 0;
    for (const entry of entries) {
        if (entry.day > day) break;
        if (entry.pct > best) best = entry.pct;
    }
    return best;
}

/**
 * Fraction of a story delivered as at `day`, in the range 0..1.
 * completed_at is exact, so it wins outright; anything unfinished falls back to
 * the partial progress recorded in the ledger.
 */
function progressOnDay(task, ledger, day) {
    const completed = parseUtcDay(task.completed_at ? String(task.completed_at).slice(0, 10) : null);
    if (completed != null && completed <= day) return 1;
    return Math.min(100, pctOnDay(ledger, task.id, day)) / 100;
}

// ── Sprint metrics ───────────────────────────────────────────────────────────

function computeSprintMetrics(sprintTasks = [], today = utcToday(), sprint = null) {
    const cards  = sprintTasks.map(task => toCard(task, { today }));
    const counts = Object.fromEntries(TASK_BOARD_STATUSES.map(status => [status, 0]));
    cards.forEach(card => { counts[card.board_status] += 1; });

    const committedPoints = cards.reduce((sum, card) => sum + (card.story_points ?? 0), 0);
    const doneCards       = cards.filter(card => card.board_status === 'done');
    const completedPoints = doneCards.reduce((sum, card) => sum + (card.story_points ?? 0), 0);

    // Board state answers "is it done"; velocity and burndown answer "was it done
    // in time". Reporting only the first made the header claim 100% while the
    // burndown still showed points outstanding and velocity credited nothing.
    // `as at` is the sprint's own end once it is over, and today while it runs.
    const sprintEnd = parseUtcDay(sprint?.end_date);
    const asAt      = sprintEnd != null && today != null ? Math.min(sprintEnd, today) : (sprintEnd ?? today);
    const onTimePoints = doneCards.reduce((sum, card) => {
        const done = parseUtcDay(card.completed_at ? String(card.completed_at).slice(0, 10) : null);
        // An undated done story is taken at face value; only a known-late one is excluded.
        return done != null && asAt != null && done > asAt ? sum : sum + (card.story_points ?? 0);
    }, 0);

    return {
        task_count:        cards.length,
        counts,
        committed_points:  round2(committedPoints),
        completed_points:  round2(completedPoints),
        // Same rule computeVelocity uses, so the two panels can no longer disagree.
        completed_in_sprint_points: round2(onTimePoints),
        remaining_points:  round2(committedPoints - completedPoints),
        planned_hours:     round2(cards.reduce((sum, card) => sum + card.planned_hours, 0)),
        actual_hours:      round2(cards.reduce((sum, card) => sum + card.actual_hours, 0)),
        unestimated_tasks: cards.filter(card => card.story_points === null).length,
        blocked_tasks:     counts.blocked,
        overdue_tasks:     cards.filter(card => card.days_overdue > 0).length,
        completion_pct:    committedPoints > 0
            ? round2((completedPoints / committedPoints) * 100)
            : (cards.length > 0 ? round2((counts.done / cards.length) * 100) : 0),
    };
}

/**
 * Daily burndown for one sprint, in story points.
 *
 * Ideal is a straight line from the committed total to zero. Actual is real
 * history: completed_at gives the exact day a story finished, and daily_actuals
 * supplies partial progress in between — so no snapshot table is needed.
 *
 * Days after today are null rather than flat, because a flat line into the
 * future reads as "the team stalled" instead of "those days have not happened".
 *
 * Known limitation: the committed total is today's sprint membership, so pulling
 * a story in mid-sprint redraws the whole curve instead of showing a step. A
 * separate scope line would need a log of what was committed and when.
 */
function computeBurndown(sprint = {}, sprintTasks = [], dailyActuals = [], today = utcToday()) {
    const start = parseUtcDay(sprint.start_date);
    const end   = parseUtcDay(sprint.end_date);
    if (start == null || end == null) return { days: [], committed_points: 0 };

    const ledger    = indexProgressLedger(dailyActuals);
    const committed = round2(sprintTasks.reduce((sum, task) => sum + (pointsOf(task) ?? 0), 0));
    const totalDays = Math.round((end - start) / DAY_MS) + 1;
    const step      = totalDays > 1 ? committed / (totalDays - 1) : committed;

    const days = [];
    for (let index = 0; index < totalDays; index += 1) {
        const day   = start + index * DAY_MS;
        const ideal = round2(Math.max(0, committed - step * index));

        if (day > today) {
            days.push({ date: formatUtcDay(day), ideal, remaining: null });
            continue;
        }

        let burned = 0;
        for (const task of sprintTasks) {
            const points = pointsOf(task) ?? 0;
            if (points === 0) continue;
            burned += points * progressOnDay(task, ledger, day);
        }

        days.push({ date: formatUtcDay(day), ideal, remaining: round2(Math.max(0, committed - burned)) });
    }

    return { days, committed_points: committed };
}

/**
 * Points delivered in each finished sprint, plus the rolling average sprint
 * planning uses to sanity-check the next commitment.
 *
 * A sprint is credited strictly for stories completed by its own end date, read
 * from completed_at — crediting it with work finished afterwards would flatter
 * the number and make forecasting useless.
 */
function computeVelocity(sprints = [], tasksBySprintId = new Map(), today = utcToday()) {
    const history = sprints
        .filter(sprint => sprint.status === 'completed'
            || (parseUtcDay(sprint.end_date) != null && parseUtcDay(sprint.end_date) < today))
        .sort((a, b) => (a.sprint_number ?? 0) - (b.sprint_number ?? 0))
        .map(sprint => {
            const scope     = tasksBySprintId.get(sprint.id) ?? [];
            const sprintEnd = parseUtcDay(sprint.end_date);
            let committed = 0;
            let completed = 0;

            for (const task of scope) {
                const points = pointsOf(task) ?? 0;
                committed += points;
                const done = parseUtcDay(task.completed_at ? String(task.completed_at).slice(0, 10) : null);
                if (done != null && sprintEnd != null && done <= sprintEnd) completed += points;
            }

            return {
                sprint_id:        sprint.id,
                sprint_number:    sprint.sprint_number,
                name:             sprint.name,
                committed_points: round2(committed),
                completed_points: round2(completed),
            };
        });

    // Three sprints is the usual scrum window: long enough to absorb one bad
    // fortnight, short enough to still describe the team as it is now.
    const window  = history.slice(-3);
    const average = window.length
        ? round2(window.reduce((sum, entry) => sum + entry.completed_points, 0) / window.length)
        : 0;

    return { history, average_points: average, sprints_measured: window.length };
}

// ── Capacity ─────────────────────────────────────────────────────────────────

/** Working days in a window, weekends excluded. */
function workingDays(startDate, endDate) {
    const start = parseUtcDay(startDate);
    const end   = parseUtcDay(endDate);
    if (start == null || end == null || end < start) return 0;

    let count = 0;
    for (let day = start; day <= end; day += DAY_MS) {
        const weekday = new Date(day).getUTCDay();
        if (weekday !== 0 && weekday !== 6) count += 1;
    }
    return count;
}

/**
 * Sprint capacity in person-hours, from the project's active personnel, set
 * against the sprint's planned hours. Over-commitment shows at planning time
 * rather than at a retrospective the team is not going to hold.
 */
function computeCapacity(sprint = {}, personnel = [], metrics = {}) {
    const headcount = personnel.filter(person => (person.status ?? 'active') === 'active').length;
    const days      = workingDays(sprint.start_date, sprint.end_date);
    const available = headcount * days * HOURS_PER_PERSON_DAY;
    const committed = num(metrics.planned_hours);

    return {
        headcount,
        working_days:    days,
        available_hours: available,
        committed_hours: round2(committed),
        used_pct:        available > 0 ? round2((committed / available) * 100) : null,
        over_committed:  available > 0 && committed > available,
    };
}

// ── Product backlog, grouped by WBS ──────────────────────────────────────────

/**
 * Stories not committed to any sprint, grouped by their WBS node.
 *
 * The WBS is already the scope decomposition, so it is the natural backlog
 * hierarchy: a WBS node is the epic, its tasks are the stories, and a sprint
 * cuts horizontally across several nodes. Within a node, order is the way a PM
 * grooms it — overdue first, then least schedule float, then largest.
 */
function buildBacklog(tasks = [], wbsNodes = [], today = utcToday()) {
    const uncommitted = tasks
        .filter(task => task.sprint_id == null && num(task.pct_complete) < 100)
        .map(task => toCard(task, { today }));

    const nodeById = new Map(wbsNodes.map(node => [String(node.id), node]));
    const groups   = new Map();

    for (const card of uncommitted) {
        const key  = card.wbs_id == null ? 'unassigned' : String(card.wbs_id);
        const node = nodeById.get(key);
        if (!groups.has(key)) {
            groups.set(key, {
                wbs_id:   card.wbs_id ?? null,
                wbs_code: node?.wbs_code ?? card.wbs_code ?? null,
                name:     node?.name ?? null,
                tasks:    [],
            });
        }
        groups.get(key).tasks.push(card);
    }

    const byUrgency = (a, b) => {
        if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue;
        const floatA = a.float ?? Number.MAX_SAFE_INTEGER;
        const floatB = b.float ?? Number.MAX_SAFE_INTEGER;
        if (floatA !== floatB) return floatA - floatB;
        return (b.story_points ?? 0) - (a.story_points ?? 0);
    };

    return [...groups.values()]
        .map(group => {
            group.tasks.sort(byUrgency);
            return {
                ...group,
                task_count: group.tasks.length,
                points:     round2(group.tasks.reduce((sum, card) => sum + (card.story_points ?? 0), 0)),
            };
        })
        .sort((a, b) => String(a.wbs_code ?? '~').localeCompare(String(b.wbs_code ?? '~')));
}

// ── Composition ──────────────────────────────────────────────────────────────

function groupTasksBySprint(tasks = []) {
    const bySprint = new Map();
    for (const task of tasks) {
        if (task.sprint_id == null) continue;
        const list = bySprint.get(task.sprint_id) ?? [];
        list.push(task);
        bySprint.set(task.sprint_id, list);
    }
    return bySprint;
}

/** Everything the Agile landing view needs in one shot. */
function buildOverview({ sprints = [], tasks = [], wbsNodes = [], dailyActuals = [], personnel = [], now } = {}) {
    const today    = utcToday(now);
    const bySprint = groupTasksBySprint(tasks);

    const summarised = sprints.map(sprint => ({
        ...sprint,
        metrics: computeSprintMetrics(bySprint.get(sprint.id) ?? [], today, sprint),
    }));

    const active = summarised.find(sprint => sprint.status === 'active')
        ?? summarised.find(sprint => sprint.status === 'planning')
        ?? summarised[summarised.length - 1]
        ?? null;

    return {
        today:         today == null ? null : formatUtcDay(today),
        sprints:       summarised,
        active_sprint: active ? active.id : null,
        velocity:      computeVelocity(sprints, bySprint, today),
        capacity:      active ? computeCapacity(active, personnel, active.metrics) : null,
        backlog:       buildBacklog(tasks, wbsNodes, today),
        // Unsized stories inside sprints are what break the burndown, so this
        // counts committed work only — an unsized product-backlog item is fine.
        unestimated_committed: tasks.filter(task => task.sprint_id != null && pointsOf(task) === null).length,
    };
}

/** Board, metrics, capacity and burndown for one sprint. */
function buildSprintDetail({ sprint, tasks = [], dailyActuals = [], personnel = [], now } = {}) {
    if (!sprint) return null;
    const today = utcToday(now);

    const personnelById = new Map(personnel.map(person => [person.id, person]));
    const scope   = tasks.filter(task => task.sprint_id === sprint.id);
    const metrics = computeSprintMetrics(scope, today, sprint);
    const cards   = scope.map(task => toCard(task, { personnelById, today }));

    const columns = Object.fromEntries(
        BOARD_COLUMNS.map(column => [column, cards.filter(card => card.board_status === column)])
    );

    return {
        sprint,
        metrics,
        capacity: computeCapacity(sprint, personnel, metrics),
        columns,
        burndown: computeBurndown(sprint, scope, dailyActuals, today),
    };
}

module.exports = {
    TASK_BOARD_STATUSES,
    BOARD_COLUMNS,
    SPRINT_STATUSES,
    buildOverview,
    buildSprintDetail,
    normalizeSprintPayload,
    findOverlappingSprint,
    reconcileAgileUpdate,
    // exported for tests
    suggestStoryPoints,
    toCard,
    computeSprintMetrics,
    computeBurndown,
    computeVelocity,
    computeCapacity,
    buildBacklog,
    groupTasksBySprint,
    workingDays,
    utcToday,
};
