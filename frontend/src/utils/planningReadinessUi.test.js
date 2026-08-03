import test from 'node:test';
import assert from 'node:assert/strict';

import { previewRemediesForFinding, taskIdForFinding } from './planningReadinessUi.js';

test('dependency removal remains previewable when a cycle blocks shifting', () => {
    const finding = {
        code: 'DATE_ORDER_CONFLICT',
        previewAvailable: false,
        edge: { predecessorId: 20, successorId: 10 },
    };

    assert.deepEqual(previewRemediesForFinding(finding), ['remove_dependency']);
});

test('open task targets the date-conflict successor instead of sorted position', () => {
    const finding = {
        code: 'DATE_ORDER_CONFLICT',
        edge: { predecessorId: 20, successorId: 10 },
    };
    const affectedTasks = [{ id: 10 }, { id: 20 }];

    assert.equal(taskIdForFinding(finding, affectedTasks), 10);
});
