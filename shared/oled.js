import { clamp } from './clock.js';

// Burn-in guard. Every wallpaper clears to pure black each frame and builds
// its colors through color(), which applies the brightness cap.
export function createOled(brightness = 1) {
  const level = clamp(brightness, 0, 1);

  return {
    brightness: level,

    clear(ctx, width, height) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
    },

    // RGB in 0–255, alpha in 0–1.
    color(r, g, b, a = 1) {
      const s = (v) => Math.round(clamp(v, 0, 255) * level);
      return `rgba(${s(r)}, ${s(g)}, ${s(b)}, ${clamp(a, 0, 1)})`;
    },
  };
}
