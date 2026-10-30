// Deterministic scene state: given (seed, t) every machine computes the
// same draws, true function, observations and colors.
//
// The wallpaper runs one sampling process ("episode") at a time:
//   1. prior draws stream in until the screen has a full set
//   2. the "true" function is drawn in, left to right
//   3. points on it are observed: a first batch together, then one at a time
//   4. a hold, then everything fades to black
//   5. a few seconds of pure black, then the next process starts in new colors
//
// Draws are born at a steady rate. Each is drawn in left to right, stays fully
// visible for its own random time, then fades. A draw never changes shape: it
// is sampled from the posterior given the points observed when it was born.
// When a new point arrives, outdated draws are not cut short: they fade on
// their own schedules while fresh posterior draws keep arriving at the same
// rate, so the screen never thins out, and the random fade times mean the
// picture never visibly "updates" all at once.
//
// Only sampled functions and points are drawn: no mean line or band.
import { createRng, gaussian } from '../../shared/rng.js';
import { smoothstep } from '../../shared/clock.js';
import { oklch, wrapHue } from '../../shared/color.js';
import {
  conditionOn,
  crossCovariance,
  evalFeatures,
  featureMatrix,
  pathwiseUpdate,
  randomFourierFeatures,
  rbfKernel,
} from './gp.js';

export const DOMAIN = [0, 10];

export const DEFAULTS = {
  lengthscale: 1.0, // correlation distance; shorter = wigglier functions
  samples: 40, // how many draws are on screen at once
  features: 64,
  observations: 8,
  // Points sit exactly on the true function; this tiny variance only keeps
  // the matrix math numerically stable.
  noise: 1e-4,
};

// Seconds. ?speed= scales all of it.
export const TIMING = {
  draw: {
    sweep: 6.2, // time to draw a function in, left to right
    hold: [1, 3], // then fully visible for a random time in this range (staggers the fades)
    fade: 2, // then fades out over this long
    life: 10.2, // average birth-to-gone time: sweep + mean hold + fade (sets the birth rate)
    maxLife: 11.2, // longest possible: sweep + max hold + fade
  },
  episode: 1203, // one process: 20 minutes on screen, then the 3 s black gap
  truthIn: [10.2, 18.2], // drawn in once the screen has a full set of prior draws (one average life)
  observeStart: 19, // the first point appears
  firstBatch: 1, // how many points appear together at the start (1 = one at a time throughout)
  pointGap: 120, // seconds between points appearing
  pointFade: 2.5, // how long a point takes to fade into view
  fadeOut: [1197, 1200], // the final posterior lingers until here, fades to black, then stays black until the episode ends
};

// Colors, on the OKLCH color wheel. Within a process the draws and the true
// function/points are complementary (180° apart). Each new process turns the
// wheel 90°, cycling through four looks.
export const PALETTE = {
  startHue: 264, // blue draws, amber truth for episode 0
  step: 90,
  draw: { lightness: 0.66, chroma: 0.17 },
  truth: { lightness: 0.8, chroma: 0.15 },
};

export function episodeAt(t) {
  const index = Math.floor(t / TIMING.episode);
  return { index, tau: t - index * TIMING.episode };
}

// Overall visibility of the current process: 1, then a fade to black at the end.
export function envelope(tau) {
  return 1 - smoothstep(...TIMING.fadeOut, tau);
}

export function palette(episode) {
  const hue = wrapHue(PALETTE.startHue + PALETTE.step * episode);
  const truthHue = wrapHue(hue + 180);
  return {
    hue,
    truthHue,
    draw: oklch(PALETTE.draw.lightness, PALETTE.draw.chroma, hue),
    truth: oklch(PALETTE.truth.lightness, PALETTE.truth.chroma, truthHue),
  };
}

export function createScene(seed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const D = o.features;
  const M = o.observations;
  const P = TIMING.episode;
  // Births every life / samples seconds keep about `samples` draws on screen.
  const drawInterval = o.samples > 0 ? TIMING.draw.life / o.samples : Infinity;

  // Shared feature basis for every function (random Fourier features).
  const rff = randomFourierFeatures(createRng(seed, 'gp', 'features'), D, o.lengthscale);

  const normals = (random, n) => Float64Array.from({ length: n }, () => gaussian(random));

  // Value at x of the function with feature weights[offset .. offset + D).
  function evalAt(weights, x, offset = 0) {
    let f = 0;
    for (let d = 0; d < D; d++) {
      f += weights[offset + d] * rff.scale * Math.cos(rff.omega[d] * x + rff.phase[d]);
    }
    return f;
  }

  let cached = null;

  // Everything random about one process, derived from (seed, episode index).
  function episodeData(index) {
    if (cached && cached.index === index) return cached;
    const r = createRng(seed, 'episode', index);
    const truthWeights = normals(r, D);

    // One point per equal-width strip so they spread across the screen,
    // appearing in random order: a first batch together, then one at a time.
    const span = DOMAIN[1] - DOMAIN[0] - 1;
    const xs = Array.from({ length: M }, (_, k) => DOMAIN[0] + 0.5 + (span * (k + 0.15 + 0.7 * r())) / M);
    const order = shuffle(r, [...xs.keys()]);
    const batch = Math.min(TIMING.firstBatch, M);
    const obs = order.map((i, k) => ({
      x: xs[i],
      y: evalAt(truthWeights, xs[i]),
      appear: TIMING.observeStart + Math.max(0, k - batch + 1) * TIMING.pointGap,
    })); // sorted by appearance

    cached = { index, truthWeights, obs };
    return cached;
  }

  return {
    options: o,
    rff,
    evalAt,
    episodeData,
    drawWeights: (k) => normals(createRng(seed, 'draw', k), D),

    // Points visible at t, with `weight` (0–1) as each fades into view and
    // `age` (seconds since it was observed), which drives its arrival effect.
    observations(t) {
      const { index, tau } = episodeAt(t);
      const list = [];
      for (const ob of episodeData(index).obs) {
        const w = smoothstep(ob.appear, ob.appear + TIMING.pointFade, tau);
        if (w > 0) list.push({ x: ob.x, y: ob.y, weight: w, age: tau - ob.appear });
      }
      return list;
    },

    // How much of the true function is drawn (0–1, left to right).
    truthProgress(t) {
      return smoothstep(...TIMING.truthIn, episodeAt(t).tau);
    },

    // Draws of the current process alive at t, oldest first.
    //   observed: how many points the draw is conditioned on (those seen at its birth)
    //   to:       how much is drawn (0–1, left to right)
    //   alpha:    1 until the draw's own fade, then down to 0
    // No draws are born once the process has faded to black.
    draws(t) {
      if (!Number.isFinite(drawInterval)) return [];
      const { sweep, hold, fade, maxLife } = TIMING.draw;
      const { index, tau } = episodeAt(t);
      if (tau >= TIMING.fadeOut[1]) return []; // faded to black
      const start = index * P;
      const { obs } = episodeData(index);
      const first = Math.max(Math.floor((t - maxLife) / drawInterval) + 1, Math.ceil(start / drawInterval));
      const last = Math.min(Math.floor(t / drawInterval), Math.ceil((start + TIMING.fadeOut[1]) / drawInterval) - 1);
      const list = [];
      for (let k = first; k <= last; k++) {
        const birth = k * drawInterval;
        const fadeAt = birth + sweep + hold[0] + (hold[1] - hold[0]) * createRng(seed, 'hold', k)();
        const alpha = 1 - smoothstep(fadeAt, fadeAt + fade, t);
        if (alpha <= 0) continue;
        list.push({
          k,
          observed: obs.filter((ob) => ob.appear <= birth - start).length,
          to: smoothstep(birth, birth + sweep, t),
          alpha,
        });
      }
      return list;
    },

    // Vertical placement: the prior mean (0) always sits at the middle of the
    // screen (center is the offset from the middle as a fraction of height),
    // and one unit spans `scale` of the height. Fixed, so the zero line never
    // wanders; the owner's monitor handles pixel shift itself.
    framing() {
      return { center: 0, scale: 0.14 };
    },
  };
}

// Evaluates the scene's functions on a fixed grid xs. Each draw's path is
// computed once, when first needed, and kept until the draw dies.
export function createSampler(scene, xs) {
  const N = xs.length;
  const Phi = featureMatrix(scene.rff, xs);
  const kernel = rbfKernel(scene.options.lengthscale);
  const paths = new Map(); // draw k → path on grid
  const conds = new Map(); // "episode:n" → conditioning on the first n points
  let truthEpisode = null;
  let truth = null;

  // Conditioning on the first n points (in order of appearance) of an episode.
  function conditioning(episode, n) {
    const key = `${episode}:${n}`;
    let c = conds.get(key);
    if (!c) {
      const obs = scene.episodeData(episode).obs.slice(0, n);
      const X = obs.map((ob) => ob.x);
      const cond = conditionOn(X, obs.map((ob) => ob.y), X.map(() => scene.options.noise), kernel);
      c = { cond, Kx: crossCovariance(cond, xs), PhiX: featureMatrix(scene.rff, X) };
      conds.set(key, c);
      if (conds.size > 16) conds.delete(conds.keys().next().value);
    }
    return c;
  }

  // A draw: its prior sample, conditioned on the points it saw at birth (Matheron's rule).
  function path(episode, draw) {
    let p = paths.get(draw.k);
    if (!p) {
      const weights = scene.drawWeights(draw.k);
      const prior = evalFeatures(Phi, N, weights, 0, new Float64Array(N));
      if (draw.observed === 0) {
        p = prior;
      } else {
        const c = conditioning(episode, draw.observed);
        const priorX = evalFeatures(c.PhiX, draw.observed, weights, 0, new Float64Array(draw.observed));
        p = pathwiseUpdate(c.cond, c.Kx, prior, priorX, new Float64Array(N));
      }
      paths.set(draw.k, p);
    }
    return p;
  }

  return {
    // The current true function on the grid.
    truth(t) {
      const { index } = episodeAt(t);
      if (index !== truthEpisode) {
        truth = evalFeatures(Phi, N, scene.episodeData(index).truthWeights, 0, new Float64Array(N));
        truthEpisode = index;
      }
      return truth;
    },

    // Draws alive at t, each with its (fixed) path on the grid.
    draws(t) {
      const draws = scene.draws(t);
      for (const k of paths.keys()) if (!draws.length || k < draws[0].k) paths.delete(k);
      const { index } = episodeAt(t);
      return draws.map((draw) => ({ ...draw, path: path(index, draw) }));
    },
  };
}

function shuffle(random, array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
