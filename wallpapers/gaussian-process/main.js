import { run } from '../../shared/wallpaper.js';
import { smoothstep } from '../../shared/clock.js';
import { DOMAIN, createSampler, createScene, envelope, episodeAt, palette } from './scene.js';

const GRID = 180;
const DRAW_ALPHA = 0.32; // per line; overlaps add up and glow

run({
  schema: {
    samples: { type: 'int', default: 40, min: 0, max: 120 },
    lengthscale: { type: 'number', default: 1.0, min: 0.3, max: 5 },
    // Which bold line to show: the posterior mean (what a viewer can infer
    // from the points) or the hidden true function the points come from.
    line: { type: 'string', default: 'mean' },
  },

  setup({ params }) {
    const scene = createScene(params.seed, {
      samples: params.samples,
      lengthscale: params.lengthscale,
    });
    const xs = new Float64Array(GRID);
    for (let i = 0; i < GRID; i++) {
      xs[i] = DOMAIN[0] + ((DOMAIN[1] - DOMAIN[0]) * i) / (GRID - 1);
    }
    return {
      scene,
      xs,
      sampler: createSampler(scene, xs),
      px: new Float64Array(GRID),
      showTruth: params.line === 'truth',
    };
  },

  frame({ t, ctx, width, height, oled, state }) {
    const { scene, xs, sampler, px } = state;
    const { index, tau } = episodeAt(t);

    const env = envelope(tau);
    if (env <= 0) return; // between processes: pure black

    const colors = palette(index);

    // Screen mapping. The domain overshoots both edges so curves never visibly end.
    const { center, scale } = scene.framing();
    const y0 = height * (0.5 + center);
    const unit = height * scale;
    const toY = (f) => y0 - f * unit;
    const toX = (x) => ((x - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * width * 1.04 - width * 0.02;
    for (let i = 0; i < GRID; i++) px[i] = toX(xs[i]);

    ctx.globalAlpha = env;

    // The stream of draws: each is drawn in left to right, then fades.
    // Blended additively so overlaps glow.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    for (const draw of sampler.draws(t)) {
      if (draw.to <= 0) continue;
      ctx.strokeStyle = oled.color(...colors.draw, DRAW_ALPHA * draw.alpha);
      strokePath(ctx, px, draw.path, toY, draw.to);
    }
    ctx.globalCompositeOperation = 'source-over';

    // The bold line: the posterior mean (default) or, with ?line=truth, the
    // hidden true function. A soft glow beneath it; drawn in left to right with
    // a glowing pen tip. It "breathes": its width (and its glow's) swells from
    // its resting width up to double, while its opacity stays the same.
    const obs = scene.observations(t);
    const progress = scene.truthProgress(t);
    if (progress > 0) {
      const observed = obs.reduce((sum, o) => sum + o.weight, 0) / scene.options.observations;
      const width = TRUTH.width * (1 + BREATH.lineGrowth * breath(t, 0));
      const truthPath = state.showTruth ? sampler.truth(t) : sampler.mean(t);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = oled.color(...colors.truth, TRUTH.glowAlpha);
      ctx.lineWidth = width * TRUTH.glowWidth;
      strokePath(ctx, px, truthPath, toY, progress);
      ctx.strokeStyle = oled.color(...colors.truth, 0.95 - 0.1 * observed);
      ctx.lineWidth = width;
      const tip = strokePath(ctx, px, truthPath, toY, progress);
      if (progress < 1) glowDot(ctx, oled, colors.truth, tip.x, tip.y, 1, POINT_SIZE);
    }

    // Observed points: each fades in gently, with two soft rings rippling out
    // as it arrives, then breathes (in size) slightly out of step with its neighbors.
    for (const o of obs) {
      const x = toX(o.x);
      const y = toY(o.y);
      if (o.age < EVENT.duration) observationRings(ctx, oled, colors.truth, x, y, o.age);
      const b = breath(t, o.x * BREATH.spread);
      glowDot(ctx, oled, colors.truth, x, y, o.weight, POINT_SIZE * (1 + BREATH.pointSwing * (2 * b - 1)));
    }
  },
});

// The true function's line.
const TRUTH = {
  width: 1.15, // px at rest; breathing swells it up to double this
  glowWidth: 3, // the soft glow beneath it is this many times wider
  glowAlpha: 0.11,
};
const POINT_SIZE = 1.15; // observed points, scaled up slightly to sit clearly on the line

// A slow "breath" for the observed function and points: their size changes,
// their opacity doesn't. Points are phase-shifted by position, so the
// breathing ripples gently along the curve.
const BREATH = {
  period: 6,
  lineGrowth: 1, // the line swells from its resting width to (1 + lineGrowth)×, i.e. up to double
  pointSwing: 0.3, // points vary by ±30% around their normal size
  spread: 0.6, // phase shift per unit of x (the domain is 10 wide)
};

// 0 → 1 → 0 smoothly over each period.
function breath(t, phase) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / BREATH.period + phase);
}

// The arrival of a new observation: two soft rings, nothing else. Kept
// deliberately understated at the owner's request. Seconds after arrival.
const EVENT = {
  rings: 2,
  ringGap: 0.6, // stagger between the rings
  ringLife: 4, // each ring spreads and fades over this long
  ringRadius: 55, // px
  ringAlpha: 0.25,
  duration: 4.6, // ringGap * (rings - 1) + ringLife: all over by then
};

function observationRings(ctx, oled, rgb, x, y, age) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < EVENT.rings; i++) {
    const u = (age - i * EVENT.ringGap) / EVENT.ringLife;
    if (u <= 0 || u >= 1) continue;
    const eased = 1 - (1 - u) ** 3; // fast out, slowing as it spreads
    ctx.strokeStyle = oled.color(...rgb, EVENT.ringAlpha * (1 - u) ** 1.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 4 + eased * EVENT.ringRadius, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

// Strokes the stretch [from, to] (fractions of the width, 0–1) of a path,
// interpolating at both ends so the edges move smoothly. Returns the tip (the
// `to` end).
function strokePath(ctx, px, values, toY, to, from = 0) {
  const point = (u) => {
    const pos = u * (GRID - 1);
    const i = Math.min(Math.floor(pos), GRID - 2);
    const f = pos - i;
    return { x: px[i] + f * (px[i + 1] - px[i]), y: toY(values[i] + f * (values[i + 1] - values[i])) };
  };
  const start = point(from);
  const tip = point(to);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = Math.floor(from * (GRID - 1)) + 1; i < to * (GRID - 1); i++) ctx.lineTo(px[i], toY(values[i]));
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  return tip;
}

function glowDot(ctx, oled, rgb, x, y, alpha, size = 1) {
  ctx.fillStyle = oled.color(...rgb, 0.24 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, 10 * size, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = oled.color(...rgb, alpha);
  ctx.beginPath();
  ctx.arc(x, y, 3.5 * size, 0, 2 * Math.PI);
  ctx.fill();
}
