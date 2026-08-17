/**
 * agileConstants.js — presentation constants for the Agile page.
 * Location: frontend/src/utils/agileConstants.js
 *
 * Board state lives in the database now (tasks.board_status), so this file holds
 * labels and styling only. Column order must match BOARD_COLUMNS in
 * backend/services/agileService.js.
 */

export const BOARD_COLUMNS = ['todo', 'in_progress', 'review', 'blocked', 'done'];

export const COLUMN_STYLES = {
    todo: {
        labelKey: 'agile.column.todo',
        accent: 'bg-slate-400',  header: 'text-slate-600',
        chip:   'bg-slate-100 text-slate-600 border-slate-200',
    },
    in_progress: {
        labelKey: 'agile.column.inProgress',
        accent: 'bg-blue-500',   header: 'text-blue-700',
        chip:   'bg-blue-50 text-blue-700 border-blue-100',
    },
    review: {
        labelKey: 'agile.column.review',
        accent: 'bg-violet-500', header: 'text-violet-700',
        chip:   'bg-violet-50 text-violet-700 border-violet-100',
    },
    blocked: {
        labelKey: 'agile.column.blocked',
        accent: 'bg-rose-500',   header: 'text-rose-700',
        chip:   'bg-rose-50 text-rose-700 border-rose-100',
    },
    done: {
        labelKey: 'agile.column.done',
        accent: 'bg-emerald-500', header: 'text-emerald-700',
        chip:   'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
};

export const SPRINT_STATE_STYLES = {
    active:    'bg-emerald-50 text-emerald-700 border-emerald-100',
    completed: 'bg-slate-100 text-slate-500 border-slate-200',
    planning:  'bg-blue-50 text-blue-700 border-blue-100',
    cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};

// Offered when sizing a story by hand. Matches the scale the backfill snapped to.
export const POINT_SCALE = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

/**
 * Split a stored Definition of Done into checklist lines, ignoring blanks and
 * any bullet the user typed themselves. Lives here rather than beside the
 * component so fast refresh keeps working (react-refresh/only-export-components).
 */
export function toChecklist(text) {
    return String(text || '')
        .split('\n')
        .map(line => line.replace(/^\s*[-*•]\s*/, '').trim())
        .filter(Boolean);
}

/** Short "12 Mar" form used in sprint chips and chart axes. */
export function formatShortDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
