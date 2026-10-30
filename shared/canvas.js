// Full-viewport canvas that stays sharp on high-DPI screens.
// Drawing code works in CSS pixels; surface.width/height are kept current.
const MAX_DPR = 2; // higher adds GPU cost with no visible gain for soft visuals

export function createSurface(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const surface = { canvas, ctx, width: 0, height: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(surface, { width, height, dpr });
  }

  window.addEventListener('resize', resize);
  resize();
  return surface;
}
