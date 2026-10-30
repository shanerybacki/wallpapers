import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARED_SCHEMA, parseParams } from '../shared/params.js';

test('missing params use defaults', () => {
  const p = parseParams('', SHARED_SCHEMA);
  assert.deepEqual(p, { seed: 'wallpapers', speed: 1, brightness: 0.8, fps: 0 });
});

test('values are parsed and clamped', () => {
  const p = parseParams('?seed=hello&speed=100&brightness=0.5&fps=-3', SHARED_SCHEMA);
  assert.equal(p.seed, 'hello');
  assert.equal(p.speed, 20);
  assert.equal(p.brightness, 0.5);
  assert.equal(p.fps, 0);
});

test('invalid numbers fall back to defaults', () => {
  const p = parseParams('?speed=fast&brightness=', SHARED_SCHEMA);
  assert.equal(p.speed, 1);
  assert.equal(p.brightness, 0.8);
});

test('int params are rounded and custom schemas work', () => {
  const p = parseParams('?samples=12.7', { samples: { type: 'int', default: 40, min: 0, max: 120 } });
  assert.equal(p.samples, 13);
});
