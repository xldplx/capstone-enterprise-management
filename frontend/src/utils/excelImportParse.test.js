import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoDetectMapping, toISODate, parseTask, validateRow } from './excelImportParse.js';

// Column order matches TASK_COLUMNS: name, wbs, cost, hours, start, end, weight
const MAPPING = {
    task_name: 0, wbs_code: 1, planned_cost: 2, planned_hours: 3,
    planned_start: 4, planned_end: 5, weight: 6,
};
const row = (start, end) => ['Excavation', '1.1.1', 250000000, 160, start, end, 0.15];

test('toISODate keeps the calendar date of a local Date (no UTC shift)', () => {
    // The regression guard. With cellDates:true SheetJS builds Dates in local
    // time; .toISOString() would report 2026-03-31 anywhere east of UTC.
    assert.equal(toISODate(new Date(2026, 3, 1)), '2026-04-01');
    assert.equal(toISODate(new Date(2026, 0, 1)), '2026-01-01');
    assert.equal(toISODate(new Date(2026, 11, 31)), '2026-12-31');
});

test('toISODate passes through the YYYY-MM-DD strings our own export writes', () => {
    assert.equal(toISODate('2026-04-01'), '2026-04-01');
    assert.equal(toISODate('2026-04-01T00:00:00Z'), '2026-04-01');
});

test('toISODate rejects serial numbers and free text', () => {
    assert.equal(toISODate(46113.29180555556), '');
    assert.equal(toISODate('garbage'), '');
    assert.equal(toISODate(''), '');
    assert.equal(toISODate(null), '');
    assert.equal(toISODate(new Date('nope')), '');
});

test('toISODate rejects impossible calendar dates', () => {
    assert.equal(toISODate('2026-02-31'), '');
    assert.equal(toISODate('2026-13-01'), '');
});

test('auto mapping does not overwrite a field already mapped to column zero', () => {
    assert.deepEqual(autoDetectMapping(['Task Name', 'Cost Description']), {
        task_name: 0,
        planned_cost: 1,
    });
});

test('parseTask emits ISO dates for both Date cells and ISO strings', () => {
    const fromDates = parseTask(row(new Date(2026, 3, 1), new Date(2026, 3, 30)), MAPPING);
    assert.equal(fromDates.planned_start, '2026-04-01');
    assert.equal(fromDates.planned_end, '2026-04-30');

    const fromStrings = parseTask(row('2026-04-01', '2026-04-30'), MAPPING);
    assert.deepEqual(
        { s: fromStrings.planned_start, e: fromStrings.planned_end },
        { s: '2026-04-01', e: '2026-04-30' },
    );
});

test('validateRow flags an unreadable date instead of letting it reach the database', () => {
    assert.deepEqual(validateRow(row(new Date(2026, 3, 1), '2026-04-30'), MAPPING), []);

    const errors = validateRow(row(46113.29, '2026-04-30'), MAPPING);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Planned Start must be a real date/);
});

test('validateRow still accepts empty optional dates', () => {
    assert.deepEqual(validateRow(row('', ''), MAPPING), []);
});

test('validateRow rejects locale-formatted weight text instead of importing zero', () => {
    const errors = validateRow(row('2026-04-01', '2026-04-30').map((value, index) => index === 6 ? '0,5' : value), MAPPING);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Weight must be a plain number/);
});
