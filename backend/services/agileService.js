/**
 * agileService.js — derives the Agile view from data the database already holds.
 *
 * Correction #3 asks for Agile methodology without changing the Supabase schema,
 * so nothing here is stored: sprints, board columns, story points, burndown and
 * velocity are all computed from `tasks`, `daily_actuals` and `personnel`.
 *
 * Where each agile concept comes from:
 *   sprint          — projects.planned_start/planned_end tiled at a cadence
 *   sprint scope    — tasks whose planned window overlaps the sprint window
 *   board column    — tasks.pct_complete + whether planned_end has passed
 *   story points    — tasks.weight, which is already relative sizing summing to 1
 *   burndown        — daily_actuals, which records pct_complete per task per day
 *   capacity        — active personnel on the project x working days x 8h
 *
 * Every function is pure so the whole module is testable with `node --test`
 * while the real schema lives in Supabase and cannot be exercised locally.
 */

const { parseUtcDay } = require('./planningReadinessService');

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CADENCE_DAYS = 14;
const HOURS_PER_PERSON_DAY = 8;

// Board columns, in render order. 'at_risk' replaces the usual "Review" lane:
// nothing in the schema distinguishes review from in-progress, whereas an
// overdue-and-unfinished task is a real signal this codebase already computes.
const BOARD_COLUMNS = ['todo', 'in_progress', 'at_risk', 'done'];

// Story points are relative sizing, and so is `weight`. A weight of 0.05 is 5%
// of the project, which maps straight onto the Fibonacci scale as 5 points —
// so a fully weighted project totals roughly 100 points.
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

const num = (value) => parseFloat(value) || 0;

function round2(value) {
    return Math.round(value * 100) / 100;
}

function formatUtcDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

/**
 * "Today" as a UTC-day timestamp, read in Asia/Jakarta the same way
 * tasksController and projectsController do it. Sharing the convention keeps
 * the board, the float column and EVM from disagreeing about what day it is.
 */
function utcToday(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now).map(part => [part.type, part.value]));
    return parseUtcDay(`${parts.year}-${parts.month}-${parts.day}`);
}

// ── Sprints ──────────────────────────────────────────────────────────────────

/**
 * Tile fixed-length sprints across the project window.
 *
 * The tiling is deterministic — same project dates and same cadence give every
 * user the same sprints — which is what lets sprints exist at all without a
 * table to store them in. The final sprint is truncated at the project end
 * rather than overrunning it, so a 30-day project at a 14-day cadence gives
 * 14 + 14 + 2 days, not 14 + 14 + 14.
 */
function tileSprints(project = {}, cadenceDays = DEFAULT_CADENCE_DAYS, today = utcToday()) {
    const start = parseUtcDay(project.planned_start);
    const end   = parseUtcDay(project.planned_end);
    if (start == null || end == null || end < start) return [];

    const cadence = Number.isFinite(cadenceDays) && cadenceDays >= 1
        ? Math.floor(cadenceDays)
        : DEFAULT_CADENCE_DAYS;

    const sprints = [];
    let cursor = start;
    let number = 1;

    // Guard against a pathological project span producing an unbounded list.
    while (cursor <= end && number <= 500) {
        const sprintEnd = Math.min(cursor + (cadence - 1) * DAY_MS, end);
        sprints.push({
            number,
            name:       `Sprint ${number}`,
            start_date: formatUtcDay(cursor),
            end_date:   formatUtcDay(sprintEnd),
            days:       Math.round((sprintEnd - cursor) / DAY_MS) + 1,
            state:      today > sprintEnd ? 'completed' : (today >= cursor ? 'active' : 'planned'),
        });
        cursor = sprintEnd + DAY_MS;
        number += 1;
    }

    return sprints;
}

/**
 * A task belongs to a sprint when its planned window overlaps the sprint
 * window. Overlap, not containment: a task spanning three sprints is genuinely
 * worked on in all three, and hiding it from two of them would misreport the
 * board. Undated tasks belong to no sprint — they are the product backlog.
 */
function tasksInSprint(tasks = [], sprint = {}) {
    const sprintStart = parseUtcDay(sprint.start_date);
    const sprintEnd   = parseUtcDay(sprint.end_date);
    if (sprintStart == null || sprintEnd == null) return [];

    return tasks.filter(task => {
        const taskStart = parseUtcDay(task.planned_start);
        const taskEnd   = parseUtcDay(task.planned_end);
        if (taskStart == null && taskEnd == null) return false;
        // A task dated on one end only is placed by the date it has.
        const from = taskStart ?? taskEnd;
        const to   = taskEnd   ?? taskStart;
        return from <= sprintEnd && sprintStart <= to;
    });
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Story points for a task, or null when it carries no weight (unestimated). */
function storyPoints(task = {}) {
    const weight = num(task.weight);
    if (weight <= 0) return null;
    const raw = weight * 100;
    return FIBONACCI.reduce((best, candidate) =>
        Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best);
}

/**
 * Days remaining until planned_end. Negative means overdue — the raw sign is
 * what the board needs, so unlike tasksController.computeFloat this is not
 * clamped at zero. `float` in the card payload keeps the clamped convention the
 * rest of the app uses.
 */
function daysToPlannedEnd(task = {}, today = utcToday()) {
    const end = parseUtcDay(task.planned_end);
    if (end == null) return null;
    return Math.floor((end - today) / DAY_MS);
}

/**
 * Which board column a task sits in.
 *
 * Derived, never stored — which is exactly why the board can never contradict
 * EVM: both read pct_complete. 'at_risk' takes precedence over 'in_progress'
 * because an overdue task needs attention regardless of how far along it is.
 */
function classifyTask(task = {}, today = utcToday()) {
    if (num(task.pct_complete) >= 100) return 'done';
    const remaining = daysToPlannedEnd(task, today);
    if (remaining !== null && remaining < 0) return 'at_risk';
    return num(task.pct_complete) > 0 ? 'in_progress' : 'todo';
}

/** Shape a task row into the card the board renders. */
function toCard(task = {}, today = utcToday()) {
    const remaining = daysToPlannedEnd(task, today);
    const pct = num(task.pct_complete);
    return {
        id:            task.id,
        task_name:     task.task_name,
        wbs_code:      task.wbs_code,
        column:        classifyTask(task, today),
        pct_complete:  pct,
        story_points:  storyPoints(task),
        planned_hours: num(task.planned_hours),
        actual_hours:  num(task.actual_hours),
        planned_cost:  num(task.planned_cost),
        planned_start: task.planned_start,
        planned_end:   task.planned_end,
        float:         remaining === null ? null : Math.max(0, remaining),
        days_overdue:  remaining !== null && remaining < 0 ? Math.abs(remaining) : 0,
    };
}

// ── Progress ledger ──────────────────────────────────────────────────────────

/**
 * Index `daily_actuals` into task_id -> sorted [{ day, pct }].
 *
 * submitDailyActuals stores pct_complete as the cumulative figure reported that
 * day and rolls the task forward with max(), so reading progress back as a
 * running maximum matches how it was written. Rows arrive newest-first from the
 * API and are sorted here rather than relying on the caller's ordering.
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

// ── Sprint metrics, burndown, velocity ───────────────────────────────────────

function computeSprintMetrics(sprintTasks = [], today = utcToday()) {
    const cards = sprintTasks.map(task => toCard(task, today));

    const counts = Object.fromEntries(BOARD_COLUMNS.map(column => [column, 0]));
    cards.forEach(card => { counts[card.column] += 1; });

    const committedPoints = cards.reduce((sum, card) => sum + (card.story_points ?? 0), 0);
    const completedPoints = cards
        .filter(card => card.column === 'done')
        .reduce((sum, card) => sum + (card.story_points ?? 0), 0);

    const plannedHours = cards.reduce((sum, card) => sum + card.planned_hours, 0);

    return {
        task_count:        cards.length,
        counts,
        committed_points:  round2(committedPoints),
        completed_points:  round2(completedPoints),
        remaining_points:  round2(committedPoints - completedPoints),
        planned_hours:     round2(plannedHours),
        actual_hours:      round2(cards.reduce((sum, card) => sum + card.actual_hours, 0)),
        unestimated_tasks: cards.filter(card => card.story_points === null).length,
        completion_pct:    committedPoints > 0
            ? round2((completedPoints / committedPoints) * 100)
            : (cards.length > 0 ? round2((counts.done / cards.length) * 100) : 0),
    };
}

/**
 * Daily burndown for one sprint, in story points.
 *
 * Ideal is a straight line from the committed total to zero. Actual is
 * reconstructed from the daily_actuals ledger, so it is real history rather
 * than a line drawn between two points — this is the whole reason the feature
 * needs no snapshot table.
 *
 * Two deliberate details:
 *  - Days after today are null, not flat. A flat line into the future reads as
 *    "the team stalled" instead of "those days have not happened yet".
 *  - For a sprint still running, the latest plotted day is reconciled against
 *    the task's current pct_complete. Progress entered through the task endpoint
 *    rather than the daily-actuals form leaves no ledger row, and without this
 *    the chart would end on a figure the rest of the app disagrees with. A
 *    FINISHED sprint is never reconciled — crediting it with work completed
 *    after it closed would rewrite history and contradict computeVelocity,
 *    which measures each sprint strictly as at its own end date.
 *
 * Known limitation, inherent to deriving sprint scope from task dates: the
 * committed total is computed from CURRENT sprint membership, so re-planning a
 * task's dates into or out of this sprint redraws the whole history rather than
 * showing up as a step. A tool with a stored sprint backlog would draw a
 * separate scope line here; that needs a table to record what was committed and
 * when, which this schema does not have.
 */
function computeBurndown(sprint = {}, sprintTasks = [], dailyActuals = [], today = utcToday()) {
    const start = parseUtcDay(sprint.start_date);
    const end   = parseUtcDay(sprint.end_date);
    if (start == null || end == null) return { days: [], committed_points: 0 };

    const ledger    = indexProgressLedger(dailyActuals);
    const pointsFor = new Map(sprintTasks.map(task => [task.id, storyPoints(task) ?? 0]));
    const committed = round2([...pointsFor.values()].reduce((sum, points) => sum + points, 0));

    const totalDays = Math.round((end - start) / DAY_MS) + 1;
    const step      = totalDays > 1 ? committed / (totalDays - 1) : committed;
    // Only a sprint that is still open gets its final point reconciled.
    const reconcileDay = today <= end ? today : null;

    const days = [];
    for (let index = 0; index < totalDays; index += 1) {
        const day = start + index * DAY_MS;
        const ideal = round2(Math.max(0, committed - step * index));

        if (day > today) {
            days.push({ date: formatUtcDay(day), ideal, remaining: null });
            continue;
        }

        let burned = 0;
        for (const task of sprintTasks) {
            const points = pointsFor.get(task.id) ?? 0;
            if (points === 0) continue;
            let pct = pctOnDay(ledger, task.id, day);
            if (day === reconcileDay) pct = Math.max(pct, num(task.pct_complete));
            burned += points * Math.min(100, pct) / 100;
        }

        days.push({ date: formatUtcDay(day), ideal, remaining: round2(Math.max(0, committed - burned)) });
    }

    return { days, committed_points: committed };
}

/**
 * Points completed in each finished sprint, plus the rolling average sprint
 * planning uses to sanity-check the next commitment.
 *
 * A sprint's completed points are measured as at its own end date, from the
 * ledger — not from today's pct_complete, which would credit past sprints with
 * work finished long afterwards and flatter the velocity.
 */
function computeVelocity(sprints = [], tasks = [], dailyActuals = [], today = utcToday()) {
    const ledger = indexProgressLedger(dailyActuals);

    const history = sprints
        .filter(sprint => sprint.state === 'completed')
        .map(sprint => {
            const scope     = tasksInSprint(tasks, sprint);
            const sprintEnd = parseUtcDay(sprint.end_date);
            let committed = 0;
            let completed = 0;

            for (const task of scope) {
                const points = storyPoints(task) ?? 0;
                committed += points;
                if (pctOnDay(ledger, task.id, sprintEnd) >= 100) completed += points;
            }

            return {
                sprint_number:    sprint.number,
                name:             sprint.name,
                committed_points: round2(committed),
                completed_points: round2(completed),
            };
        });

    // Three sprints is the usual scrum window: long enough to absorb one bad
    // fortnight, short enough to still describe the team as it is now.
    const window = history.slice(-3);
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
 * Sprint capacity in person-hours, from the project's active personnel.
 * Compared against the sprint's planned hours so over-commitment is visible at
 * planning time instead of at the retrospective the team is not going to hold.
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

// ── Product backlog ──────────────────────────────────────────────────────────

/**
 * Everything not pulled into a sprint: tasks with no planned dates at all, plus
 * any dated task that falls outside every sprint window (possible when a task
 * runs past the project's own planned end).
 *
 * Ranked the way a PM would groom it — overdue first, then least schedule float,
 * then heaviest. There is no stored rank column and none is faked.
 */
function buildBacklog(tasks = [], sprints = [], today = utcToday()) {
    const scheduled = new Set();
    for (const sprint of sprints) {
        for (const task of tasksInSprint(tasks, sprint)) scheduled.add(task.id);
    }

    return tasks
        .filter(task => !scheduled.has(task.id) && num(task.pct_complete) < 100)
        .map(task => toCard(task, today))
        .sort((a, b) => {
            if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue;
            const floatA = a.float ?? Number.MAX_SAFE_INTEGER;
            const floatB = b.float ?? Number.MAX_SAFE_INTEGER;
            if (floatA !== floatB) return floatA - floatB;
            return (b.story_points ?? 0) - (a.story_points ?? 0);
        });
}

// ── Composition ──────────────────────────────────────────────────────────────

/** Everything the Agile landing view needs in one shot. */
function buildOverview({ project, tasks = [], dailyActuals = [], personnel = [], cadenceDays, now } = {}) {
    const today   = utcToday(now);
    const sprints = tileSprints(project, cadenceDays, today);

    const summarised = sprints.map(sprint => {
        const scope = tasksInSprint(tasks, sprint);
        return { ...sprint, metrics: computeSprintMetrics(scope, today) };
    });

    const active = summarised.find(sprint => sprint.state === 'active')
        ?? summarised.find(sprint => sprint.state === 'planned')
        ?? summarised[summarised.length - 1]
        ?? null;

    return {
        cadence_days:      Number.isFinite(cadenceDays) && cadenceDays >= 1 ? Math.floor(cadenceDays) : DEFAULT_CADENCE_DAYS,
        today:             today == null ? null : formatUtcDay(today),
        sprints:           summarised,
        active_sprint:     active ? active.number : null,
        velocity:          computeVelocity(sprints, tasks, dailyActuals, today),
        capacity:          active ? computeCapacity(active, personnel, active.metrics) : null,
        backlog:           buildBacklog(tasks, sprints, today),
        unestimated_total: tasks.filter(task => storyPoints(task) === null).length,
    };
}

/** Board, metrics, capacity and burndown for one sprint. */
function buildSprintDetail({ project, sprintNumber, tasks = [], dailyActuals = [], personnel = [], cadenceDays, now } = {}) {
    const today   = utcToday(now);
    const sprints = tileSprints(project, cadenceDays, today);
    const sprint  = sprints.find(candidate => candidate.number === Number(sprintNumber));
    if (!sprint) return null;

    const scope   = tasksInSprint(tasks, sprint);
    const metrics = computeSprintMetrics(scope, today);
    const cards   = scope.map(task => toCard(task, today));

    const columns = Object.fromEntries(
        BOARD_COLUMNS.map(column => [column, cards.filter(card => card.column === column)])
    );

    return {
        sprint:   { ...sprint, total_sprints: sprints.length },
        metrics,
        capacity: computeCapacity(sprint, personnel, metrics),
        columns,
        burndown: computeBurndown(sprint, scope, dailyActuals, today),
    };
}

module.exports = {
    BOARD_COLUMNS,
    DEFAULT_CADENCE_DAYS,
    buildOverview,
    buildSprintDetail,
    // exported for tests
    tileSprints,
    tasksInSprint,
    storyPoints,
    classifyTask,
    toCard,
    computeSprintMetrics,
    computeBurndown,
    computeVelocity,
    computeCapacity,
    buildBacklog,
    workingDays,
    utcToday,
};
