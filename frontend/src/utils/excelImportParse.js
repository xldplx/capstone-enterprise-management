/**
 * excelImportParse.js — pure parsing/validation helpers for the Excel import wizard.
 * Location: frontend/src/utils/excelImportParse.js
 *
 * Extracted out of ExcelImport.jsx so they can be unit-tested without React.
 * Keep this module free of React, lucide, and xlsx imports — `node --test` loads it directly.
 */

/**
 * Excel date cells arrive as JS Date objects (the reader is called with
 * `cellDates: true`). Those Dates are constructed in LOCAL time, so
 * `.toISOString()` shifts them backwards for any timezone east of UTC — in
 * UTC+7 a 2026-04-01 cell would serialise as "2026-03-31". Read the local
 * components instead so the date the user typed is the date we store.
 *
 * Also accepts the plain YYYY-MM-DD strings our own Excel export writes.
 * Anything else (a raw serial number, free text) returns '' so validateRow
 * can surface it as a row error instead of failing later at the DB.
 */
export function toISODate(value) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return '';
        const year  = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day   = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const text = String(value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

export function autoDetectMapping(headers) {
    const mapping = {};
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    const patterns = {
        task_name:     ['taskname', 'task', 'name', 'activity', 'description'],
        wbs_code:      ['wbs', 'wbscode', 'code'],
        planned_cost:  ['plannedcost', 'cost', 'budget', 'estimatedcost'],
        planned_hours: ['plannedhours', 'hours', 'manhours', 'laborhours'],
        planned_start: ['plannedstart', 'start', 'startdate', 'begin'],
        planned_end:   ['plannedend', 'end', 'enddate', 'finish'],
        weight:        ['weight', 'weighting', 'proportion'],
    };

    headers.forEach((header, index) => {
        const norm = normalize(header);
        for (const [field, keywords] of Object.entries(patterns)) {
            if (!mapping[field] && keywords.some(kw => norm.includes(kw))) {
                mapping[field] = index;
            }
        }
    });

    return mapping;
}

// A numeric cell that arrives as a formatted string (e.g. "1,000.50") would be
// silently truncated by parseFloat ("1,000.50" → 1). Reject those explicitly so
// the user fixes the source cell instead of importing a corrupt value.
export function numericFieldError(raw, label) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return `${label} is required`;
    const s = String(raw).trim();
    if (typeof raw === 'string' && !/^-?\d+(\.\d+)?$/.test(s)) {
        return `${label} must be a plain number (remove thousands separators or text)`;
    }
    const n = parseFloat(s);
    if (isNaN(n) || n <= 0) return `${label} must be greater than 0`;
    return null;
}

const valueAt = (row, mapping, field) => {
    const idx = mapping[field];
    return idx !== undefined && idx !== '' ? row[idx] : undefined;
};

export function validateRow(row, mapping) {
    const errors = [];
    const getValue = (field) => valueAt(row, mapping, field);

    // Required string fields
    if (!getValue('task_name')?.toString().trim()) errors.push('Task Name is required');
    if (!getValue('wbs_code')?.toString().trim()) errors.push('WBS Code is required');

    // Required number fields — reject formatted/locale strings, not just <= 0
    const costErr = numericFieldError(getValue('planned_cost'), 'Planned Cost');
    if (costErr) errors.push(costErr);
    const hoursErr = numericFieldError(getValue('planned_hours'), 'Planned Hours');
    if (hoursErr) errors.push(hoursErr);

    // Optional dates — but if a mapped date cell holds something we cannot read,
    // say so here rather than letting the insert fail with a raw DB error.
    [['planned_start', 'Planned Start'], ['planned_end', 'Planned End']].forEach(([field, label]) => {
        const raw = getValue(field);
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        if (!toISODate(raw)) errors.push(`${label} must be a real date (use a date cell or YYYY-MM-DD)`);
    });

    // Optional: weight
    const weight = getValue('weight');
    if (weight !== undefined && weight !== '' && weight !== null) {
        const w = parseFloat(weight);
        if (isNaN(w) || w < 0 || w > 1) errors.push('Weight must be 0–1');
    }

    return errors;
}

export function parseTask(row, mapping) {
    const getValue = (field) => valueAt(row, mapping, field);

    return {
        task_name:     getValue('task_name')?.toString().trim() || '',
        wbs_code:      getValue('wbs_code')?.toString().trim()  || '',
        planned_cost:  parseFloat(getValue('planned_cost'))  || 0,
        planned_hours: parseFloat(getValue('planned_hours')) || 0,
        planned_start: toISODate(getValue('planned_start')),
        planned_end:   toISODate(getValue('planned_end')),
        weight:        parseFloat(getValue('weight'))        || 0,
    };
}
