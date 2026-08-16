/**
 * agileConstants.js — presentation constants for the Agile page.
 * Location: frontend/src/utils/agileConstants.js
 *
 * The derivation itself lives server-side in backend/services/agileService.js,
 * so this file holds labels and styling only. Keeping the two apart is what
 * stops the board the API computes and the board the user sees from drifting.
 */

// Column order must match BOARD_COLUMNS in the backend service.
export const BOARD_COLUMNS = ['todo', 'in_progress', 'at_risk', 'done'];

export const COLUMN_STYLES = {
    todo: {
        labelKey: 'agile.column.todo',
        accent:   'bg-slate-400',
        header:   'text-slate-600',
        chip:     'bg-slate-100 text-slate-600 border-slate-200',
    },
    in_progress: {
        labelKey: 'agile.column.inProgress',
        accent:   'bg-blue-500',
        header:   'text-blue-700',
        chip:     'bg-blue-50 text-blue-700 border-blue-100',
    },
    at_risk: {
        labelKey: 'agile.column.atRisk',
        accent:   'bg-rose-500',
        header:   'text-rose-700',
        chip:     'bg-rose-50 text-rose-700 border-rose-100',
    },
    done: {
        labelKey: 'agile.column.done',
        accent:   'bg-emerald-500',
        header:   'text-emerald-700',
        chip:     'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
};

// 'at_risk' is derived from an overdue planned_end, not chosen by a person, so
// it is never a drop target — the only way out of it is to finish the work or
// move the date on the planning page.
export const DROPPABLE_COLUMNS = ['todo', 'in_progress', 'done'];

// Percent written when a card is dropped into a column. 'in_progress' has no
// single correct value, so the board asks rather than inventing one.
export const COLUMN_TARGET_PCT = {
    todo: 0,
    done: 100,
};

export const SPRINT_STATE_STYLES = {
    active:    'bg-emerald-50 text-emerald-700 border-emerald-100',
    completed: 'bg-slate-100 text-slate-500 border-slate-200',
    planned:   'bg-blue-50 text-blue-700 border-blue-100',
};

export const CADENCE_OPTIONS = [7, 14, 21, 28];

/** Short "12 Mar" form used in sprint chips and chart axes. */
export function formatShortDate(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
