import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePlanningLockState } from './planningLockState.js';

test('an explicit no-baseline response overrides stale task lock flags', () => {
    const tasks = [{ id: 1, is_baseline_locked: true }];
    const noBaseline = { success: false, data: null };

    assert.equal(resolvePlanningLockState(tasks, noBaseline), false);
});

test('baseline metadata is authoritative and task flags remain a network-error fallback', () => {
    assert.equal(resolvePlanningLockState([], { success: true, data: { baseline_name: 'Rev.0' } }), true);
    assert.equal(resolvePlanningLockState([{ is_baseline_locked: true }], { success: false }), true);
});
