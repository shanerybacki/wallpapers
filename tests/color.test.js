import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oklch, wrapHue } from '../shared/color.js';

test('oklch hits known sRGB colors', () => {
  assert.deepEqual(oklch(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(oklch(1, 0, 0), [255, 255, 255]);
  const red = oklch(0.62796, 0.25768, 29.234);
  assert.ok(red[0] >= 254 && red[1] <= 2 && red[2] <= 2, `red came out ${red}`);
});

test('oklch output is always valid 0–255 RGB, even out of gamut', () => {
  for (let h = 0; h < 360; h += 15) {
    for (const v of oklch(0.7, 0.4, h)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 255);
  }
});

test('wrapHue keeps hues in [0, 360)', () => {
  assert.equal(wrapHue(370), 10);
  assert.equal(wrapHue(-90), 270);
  assert.equal(wrapHue(264 + 90 * 1e7), (264 + 90 * 1e7) % 360);
});
