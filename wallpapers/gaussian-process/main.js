import { run } from '../../shared/wallpaper.js';
import { smoothstep } from '../../shared/clock.js';
import { DOMAIN, createSampler, createScene, envelope, episodeAt, palette } from './scene.js';

const GRID = 180;
const DRAW_ALPHA = 0.25; // per line; overlaps add up and glow

run({
  schema: {
    samples: { type: 'int', default: 40, min: 0, max: 120 },
    lengthscale: { type: 'number', default: 1.0, min: 0.3, max: 5 },
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
    return { scene, xs, sampler: createSampler(scene, xs), px: new Float64Array(GRID) };
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

    // The true function, drawn in left to right with a glowing pen tip. It
    // dims while points are on it so the draws converging on it stand out,
    // and it "breathes" slowly.
    const obs = scene.observations(t);
    const progress = scene.truthProgress(t);
    if (progress > 0) {
      const observed = obs.reduce((sum, o) => sum + o.weight, 0) / scene.options.observations;
      ctx.strokeStyle = oled.color(...colors.truth, (0.6 - 0.25 * observed) * breath(t, 0));
      ctx.lineWidth = 1.5;
      const tip = strokePath(ctx, px, sampler.truth(t), toY, progress);
      if (progress < 1) glowDot(ctx, oled, colors.truth, tip.x, tip.y, 1);
    }

    // Observed points: each fades in gently, with two soft rings rippling out
    // as it arrives, then breathes slightly out of step with its neighbors.
    for (const o of obs) {
      const x = toX(o.x);
      const y = toY(o.y);
      if (o.age < EVENT.duration) observationRings(ctx, oled, colors.truth, x, y, o.age);
      const b = breath(t, o.x * BREATH.spread);
      glowDot(ctx, oled, colors.truth, x, y, o.weight * b, 1 + BREATH.swell * (b - 1 + BREATH.depth) / BREATH.depth);
    }
  },
});

// A slow "breath" for the observed function and points: brightness eases
// between (1 - depth) and 1 every `period` seconds. Points are phase-shifted
// by their position, so the breathing ripples gently along the curve.
const BREATH = {
  period: 6,
  depth: 0.25,
  spread: 0.6, // phase shift per unit of x (the domain is 10 wide)
  swell: 0.25, // a point's glow grows by up to this fraction at full breath
};

function breath(t, phase) {
  return 1 - BREATH.depth * (0.5 + 0.5 * Math.cos((2 * Math.PI * t) / BREATH.period + phase));
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

function glowDot(ctx, oled, rgb, x, y, alpha, glow = 1) {
  ctx.fillStyle = oled.color(...rgb, 0.18 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, 10 * glow, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = oled.color(...rgb, alpha);
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
  ctx.fill();
}
