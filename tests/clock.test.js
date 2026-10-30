import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeSlots, smoothstep, wallTime } from '../shared/clock.js';

test('wallTime is epoch seconds scaled by speed', () => {
  assert.equal(wallTime(1, 1_700_000_000_000), 1_700_000_000);
  assert.equal(wallTime(2, 1000), 2);
});

test('smoothstep clamps and hits its endpoints', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 2), 1);
});

test('activeSlots returns exactly the slots alive at t', () => {
  const period = 6, lifetime = 40, t = 1000.5;
  const { first, last } = activeSlots(t, period, lifetime);
  for (let k = first - 3; k <= last + 3; k++) {
    const age = t - k * period;
    const alive = age >= 0 && age < lifetime;
    assert.equal(k >= first && k <= last, alive, `slot ${k}`);
  }
});
