import test from 'node:test';
import assert from 'node:assert/strict';

import { exportFilename } from './excelExport.js';

test('export filename uses the local calendar day instead of UTC', () => {
    const RealDate = globalThis.Date;
    globalThis.Date = class extends RealDate {
        constructor(...args) {
            super(...(args.length ? args : ['2026-04-01T00:30:00+07:00']));
        }
    };

    try {
        assert.equal(exportFilename('Tasks', 'PRJ-1'), 'Tasks_PRJ-1_2026-04-01.xlsx');
    } finally {
        globalThis.Date = RealDate;
    }
});
