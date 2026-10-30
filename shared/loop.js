// Animation loop at the display's refresh rate (e.g. 120 Hz), with an
// optional frame-rate cap. Stops while the page is hidden to save power.
export function startLoop(tick, { fps = 0 } = {}) {
  const minInterval = fps > 0 ? 1000 / fps : 0;
  let last = -Infinity;
  let id = 0;

  function step(now) {
    id = requestAnimationFrame(step);
    // 1 ms tolerance so a 60 fps cap on a 120 Hz screen keeps every other frame.
    if (minInterval && now - last < minInterval - 1) return;
    last = now;
    tick(now);
  }

  function onVisibility() {
    cancelAnimationFrame(id);
    if (!document.hidden) id = requestAnimationFrame(step);
  }

  document.addEventListener('visibilitychange', onVisibility);
  id = requestAnimationFrame(step);

  return function stop() {
    cancelAnimationFrame(id);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
