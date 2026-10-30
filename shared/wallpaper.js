import { wallTime } from './clock.js';
import { SHARED_SCHEMA, parseParams } from './params.js';
import { createSurface } from './canvas.js';
import { startLoop } from './loop.js';
import { createOled } from './oled.js';

// Entry point for a wallpaper page.
//
//   run({
//     schema: { extraParam: { type: 'number', default: 1 } },
//     setup({ params, surface, oled }) { return state; },
//     frame({ t, ctx, width, height, params, oled, state }) { ... },
//   });
//
// `t` is shared wall-clock time in seconds (scaled by ?speed=). The frame
// must depend only on t, params and state built from params, so everyone
// with the same URL sees the same picture.
export function run({ schema = {}, setup, frame }) {
  const params = parseParams(window.location.search, { ...SHARED_SCHEMA, ...schema });

  let canvas = document.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }

  const surface = createSurface(canvas);
  const oled = createOled(params.brightness);
  const state = setup ? setup({ params, surface, oled }) : undefined;

  return startLoop(() => {
    const { ctx, width, height } = surface;
    oled.clear(ctx, width, height);
    ctx.save();
    frame({ t: wallTime(params.speed), ctx, width, height, params, oled, state });
    ctx.restore();
  }, { fps: params.fps });
}
