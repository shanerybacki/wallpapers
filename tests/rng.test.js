import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, gaussian } from '../shared/rng.js';

const take = (random, n) => Array.from({ length: n }, random);

test('same keys give the same sequence', () => {
  assert.deepEqual(take(createRng('seed', 'a', 1), 20), take(createRng('seed', 'a', 1), 20));
});

test('different keys give different sequences', () => {
  assert.notDeepEqual(take(createRng('seed', 'a', 1), 5), take(createRng('seed', 'a', 2), 5));
  assert.notDeepEqual(take(createRng('seed'), 5), take(createRng('seeds'), 5));
});

test('uniform values are in [0, 1)', () => {
  for (const v of take(createRng('range'), 10000)) assert.ok(v >= 0 && v < 1);
});

test('gaussian has roughly zero mean and unit variance', () => {
  const random = createRng('normal');
  const n = 50000;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const z = gaussian(random);
    sum += z;
    sumSq += z * z;
  }
  const mean = sum / n;
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(sumSq / n - mean * mean - 1) < 0.05);
});
