import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE,
  TIMING,
  createSampler,
  createScene,
  envelope,
  episodeAt,
  palette,
} from '../wallpapers/gaussian-process/scene.js';

// A realistic epoch time aligned to the start of an episode.
const E0 = Math.ceil(1_760_000_000 / TIMING.episode) * TIMING.episode;
const EP = E0 / TIMING.episode; // its index
const M = 8; // points per process (DEFAULTS.observations)
const B = TIMING.firstBatch;
const LAST_ARRIVAL = TIMING.observeStart + (M - B) * TIMING.pointGap;
const grid = Float64Array.from({ length: 90 }, (_, i) => i / 9);

test('same seed and time give the identical scene on separate instances', () => {
  const a = createScene('sync');
  const b = createScene('sync');
  const t = E0 + 15.25;
  assert.deepEqual(a.observations(t), b.observations(t));
  assert.deepEqual(a.draws(t), b.draws(t));
  assert.deepEqual(a.episodeData(EP), b.episodeData(EP));
  assert.deepEqual(a.framing(t), b.framing(t));
  const pa = createSampler(a, grid).draws(t).map((d) => [...d.path]);
  const pb = createSampler(b, grid).draws(t).map((d) => [...d.path]);
  assert.deepEqual(pa, pb);
});

test('different seeds and different episodes give different scenes', () => {
  const t = E0 + TIMING.observeStart + TIMING.pointGap + 1; // a couple of points are in
  assert.ok(createScene('a').observations(t).length > 0);
  assert.notDeepEqual(createScene('a').observations(t), createScene('b').observations(t));
  const scene = createScene('a');
  assert.notDeepEqual(
    scene.observations(t).map((o) => o.x),
    scene.observations(t + TIMING.episode).map((o) => o.x),
  );
});

test('episodeAt splits time into episode index and time within it', () => {
  const { index, tau } = episodeAt(E0 + 5.5);
  assert.equal(index, EP);
  assert.ok(Math.abs(tau - 5.5) < 1e-6);
});

test('the phases happen in order, ending in 3 s of black', () => {
  const T = TIMING;
  assert.ok(T.truthIn[0] >= T.draw.life); // a full set of prior draws first
  assert.ok(T.truthIn[1] <= T.observeStart);
  assert.ok(LAST_ARRIVAL + T.draw.maxLife <= T.fadeOut[0]); // a full set of final posterior draws before the fade
  assert.equal(T.episode - T.fadeOut[1], 3);
});

test('the screen fades to black at the end of a process and stays black', () => {
  assert.equal(envelope(0), 1);
  assert.equal(envelope(TIMING.fadeOut[0]), 1);
  assert.equal(envelope(TIMING.fadeOut[1]), 0);
  assert.equal(envelope(TIMING.episode - 0.01), 0);
});

test('colors: complementary within a process, a 90° turn between processes', () => {
  for (const e of [0, 1, 2, EP]) {
    const a = palette(e);
    const b = palette(e + 1);
    assert.equal((a.truthHue - a.hue + 360) % 360, 180);
    assert.equal((b.hue - a.hue + 360) % 360, PALETTE.step);
    assert.notDeepEqual(a.draw, b.draw);
  }
});

test('the screen fills with `samples` prior draws before the true function starts', () => {
  const scene = createScene('fill', { samples: 20 });
  const count = (tau) => scene.draws(E0 + tau).length;
  assert.ok(count(0.25) < 5);
  assert.ok(count(TIMING.truthIn[0]) >= 19);
  assert.ok(scene.truthProgress(E0 + TIMING.truthIn[0]) < 1e-9); // not started yet (allowing for rounding)
  assert.ok(scene.truthProgress(E0 + TIMING.truthIn[0] + 1) > 0);
});

test('about `samples` draws are on screen, each drawn in then faded on its own schedule', () => {
  const S = 20;
  const scene = createScene('stream', { samples: S });
  const { sweep, hold, fade, life, maxLife } = TIMING.draw;
  assert.ok(Math.abs(sweep + (hold[0] + hold[1]) / 2 + fade - life) < 1e-9);
  assert.ok(Math.abs(sweep + hold[1] + fade - maxLife) < 1e-9);
  for (let tau = maxLife; tau < TIMING.fadeOut[0]; tau += 3.7) {
    const draws = scene.draws(E0 + tau);
    assert.ok(draws.length >= S - 3 && draws.length <= S + 3, `got ${draws.length}`);
    assert.ok(draws.at(-1).to < 0.3 && draws.at(-1).alpha === 1); // newest: just starting to draw in
    for (const d of draws) assert.ok(d.alpha > 0 && d.alpha <= 1);
  }
});

test('fades are staggered at random, not in birth order', () => {
  const scene = createScene('stagger', { samples: 40 });
  // Often (not necessarily at every instant) a draw is fading while an older one is still at full strength.
  let outOfOrder = 0;
  for (let i = 0; i < 40; i++) {
    const draws = scene.draws(E0 + 30 + i * 2.3);
    const fading = draws.filter((d) => d.alpha < 1).map((d) => d.k);
    const oldestFull = Math.min(...draws.filter((d) => d.alpha === 1 && d.to === 1).map((d) => d.k));
    if (fading.some((k) => k > oldestFull)) outOfOrder++;
  }
  assert.ok(outOfOrder >= 10, `only ${outOfOrder} of 40 moments showed out-of-order fades`);
});

// Total curve "ink" crossing a vertical line at x (each draw counts by its alpha).
const coverage = (scene, t, x) =>
  scene.draws(t).reduce((sum, d) => sum + (d.to > x ? d.alpha : 0), 0);

test('the screen never thins out after a new point (no "open water")', () => {
  const scene = createScene('water', { samples: 40 });
  for (let n = 1; n < M; n++) {
    const arrival = TIMING.observeStart + n * TIMING.pointGap;
    for (const x of [0.1, 0.5, 0.9]) {
      // Typical coverage over the 10 s before the point. Random hold times make
      // it wobble a little; cutting old draws short would make it collapse.
      let before = 0;
      for (let dt = 0.5; dt <= 10; dt += 0.5) before += coverage(scene, E0 + arrival - dt, x) / 20;
      for (let dt = 0; dt <= TIMING.draw.maxLife; dt += 0.5) {
        const now = coverage(scene, E0 + arrival + dt, x);
        assert.ok(now > 0.7 * before, `coverage at x=${x} fell to ${now.toFixed(1)} from ~${before.toFixed(1)}, ${dt} s after a point`);
      }
    }
  }
});

test('no draws survive into the black gap or the next process', () => {
  const scene = createScene('gap');
  assert.equal(scene.draws(E0 + TIMING.episode - 0.5).length, 0);
  for (const d of scene.draws(E0 + TIMING.episode + 0.5)) assert.ok(d.to < 1 && d.observed === 0);
});

test('the first batch of points (possibly just one) appears together, then the rest one at a time, and they stay', () => {
  const scene = createScene('count');
  const count = (tau) => scene.observations(E0 + tau).length;
  assert.equal(count(TIMING.observeStart - 0.1), 0);
  assert.equal(count(TIMING.observeStart + 0.1), B);
  assert.equal(count(TIMING.observeStart + TIMING.pointGap - 0.1), B);
  let previous = B;
  for (let tau = TIMING.observeStart + 0.1; tau <= LAST_ARRIVAL + 1; tau += 0.25) {
    const n = count(tau);
    assert.ok(n >= previous && n - previous <= 1, `appearing: ${previous} → ${n}`);
    previous = n;
  }
  assert.equal(count(TIMING.fadeOut[1]), M);
});

test('observations lie exactly on the true function and spread across the domain', () => {
  const scene = createScene('truth');
  const { truthWeights, obs } = scene.episodeData(EP);
  for (const o of obs) assert.equal(o.y, scene.evalAt(truthWeights, o.x));
  const xs = obs.map((o) => o.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 0.2);
});

test('a draw never changes shape during its life', () => {
  const scene = createScene('frozen', { samples: 12 });
  const sampler = createSampler(scene, grid);
  const seen = new Map();
  for (let tau = 0; tau < TIMING.fadeOut[1]; tau += 0.1) {
    for (const d of sampler.draws(E0 + tau)) {
      if (!seen.has(d.k)) seen.set(d.k, Float64Array.from(d.path));
      else assert.deepEqual(d.path, seen.get(d.k), `draw ${d.k} changed at tau=${tau.toFixed(1)}`);
    }
  }
});

test('after a new point, outdated draws fade on their own schedules, all gone within a draw life', () => {
  const scene = createScene('stale', { samples: 40 });
  const arrival = TIMING.observeStart + TIMING.pointGap;
  const before = new Set(scene.draws(E0 + arrival - 0.01).map((d) => d.k));
  // A few seconds on, outdated and updated draws share the screen.
  const mid = scene.draws(E0 + arrival + 4);
  assert.ok(mid.some((d) => before.has(d.k)) && mid.some((d) => !before.has(d.k)));
  // All outdated ones gone after the longest draw life.
  const after = scene.draws(E0 + arrival + TIMING.draw.maxLife);
  assert.ok(after.every((d) => !before.has(d.k)));
});

test('draw edges and fades change smoothly from frame to frame', () => {
  const scene = createScene('edges');
  for (let tau = 0; tau < TIMING.fadeOut[1]; tau += 0.05) {
    const a = new Map(scene.draws(E0 + tau).map((d) => [d.k, d]));
    for (const d of scene.draws(E0 + tau + 1 / 120)) {
      const p = a.get(d.k);
      if (!p) continue;
      assert.ok(Math.abs(d.to - p.to) < 0.01 && Math.abs(d.alpha - p.alpha) < 0.02, `draw ${d.k} at tau=${tau.toFixed(2)}`);
    }
  }
});

test('before any point is observed, draws are plain prior draws', () => {
  const scene = createScene('prior');
  for (const draw of createSampler(scene, grid).draws(E0 + TIMING.observeStart - 0.5)) {
    assert.equal(draw.observed, 0);
    const weights = scene.drawWeights(draw.k);
    grid.forEach((x, i) => assert.ok(Math.abs(draw.path[i] - scene.evalAt(weights, x)) < 1e-9));
  }
});

test('each draw passes through exactly the points observed at its birth', () => {
  const scene = createScene('posterior');
  const { obs } = scene.episodeData(EP);
  const sampler = createSampler(scene, Float64Array.from(obs.map((o) => o.x)));
  const t = E0 + LAST_ARRIVAL + 0.5; // a mix of draws born before and after the last point
  const draws = sampler.draws(t);
  assert.ok(new Set(draws.map((d) => d.observed)).size > 1);
  for (const draw of draws) {
    for (let j = 0; j < draw.observed; j++) assert.ok(Math.abs(draw.path[j] - obs[j].y) < 0.05);
  }
});

test('the prior mean is 0 and always sits at the middle of the screen', () => {
  const scene = createScene('mean');
  assert.deepEqual(scene.framing(), { center: 0, scale: 0.14 });
  // Averaging many prior draws gives ~0 everywhere (standard error here ≈ 0.016).
  const n = 4000;
  for (const x of [1, 3, 5, 7, 9]) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += scene.evalAt(scene.drawWeights(k), x);
    assert.ok(Math.abs(sum / n) < 0.07, `mean ${sum / n} at x=${x}`);
  }
  // ±2σ of the prior (unit variance) fits on screen.
  assert.ok(0.5 + 2.5 * scene.framing().scale < 1);
});

test('observations report their age, which drives the arrival effect', () => {
  const scene = createScene('age');
  const [first] = scene.observations(E0 + TIMING.observeStart + 0.75);
  assert.ok(Math.abs(first.age - 0.75) < 1e-6);
});

test('the posterior mean is 0 before any points and passes through them once all are in', () => {
  const scene = createScene('mean-line');
  const sampler = createSampler(scene, grid);
  assert.ok(sampler.mean(E0 + TIMING.observeStart - 1).every((v) => v === 0));
  const t = E0 + LAST_ARRIVAL + TIMING.pointFade + 1;
  const obs = scene.observations(t);
  assert.equal(obs.length, M);
  const atPoints = createSampler(scene, Float64Array.from(obs.map((o) => o.x))).mean(t);
  obs.forEach((o, j) => assert.ok(Math.abs(atPoints[j] - o.y) < 0.02, `mean misses point ${j}`));
});

test('the posterior mean morphs smoothly toward each new point', () => {
  const scene = createScene('mean-morph');
  const sampler = createSampler(scene, grid);
  const [lead, duration] = TIMING.meanMorph;
  for (let n = 0; n < 3; n++) {
    const arrival = TIMING.observeStart + n * TIMING.pointGap;
    for (let dt = -lead - 0.5; dt <= duration; dt += 0.05) {
      const a = Float64Array.from(sampler.mean(E0 + arrival + dt));
      const b = sampler.mean(E0 + arrival + dt + 1 / 120); // one frame at 120 Hz
      const maxStep = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      assert.ok(maxStep < 0.05, `mean jumped ${maxStep.toFixed(3)} at ${dt.toFixed(2)} s after point ${n}`);
    }
  }
});

test('the posterior mean starts moving slightly before a new point appears', () => {
  const scene = createScene('mean-early');
  const sampler = createSampler(scene, grid);
  const [lead, duration] = TIMING.meanMorph;
  const arrival = TIMING.observeStart + TIMING.pointGap; // the second point
  const settled = Float64Array.from(sampler.mean(E0 + arrival - lead - 0.1));
  const early = Float64Array.from(sampler.mean(E0 + arrival - 0.05));
  const done = Float64Array.from(sampler.mean(E0 + arrival - lead + duration));
  const later = sampler.mean(E0 + arrival + 30);
  const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  assert.ok(diff(early, settled) > 1e-4, 'mean had not started moving before the point appeared');
  assert.ok(diff(done, later) < 1e-12, 'mean still moving after the morph should be complete');
});
