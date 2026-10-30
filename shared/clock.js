// Time shared by every machine: seconds since the Unix epoch, scaled by speed.
// Wallpapers must derive their state from this, never from page-load time.
export function wallTime(speed = 1, nowMs = Date.now()) {
  return (nowMs / 1000) * speed;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function smoothstep(edge0, edge1, x) {
  const u = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return u * u * (3 - 2 * u);
}

// Recurring slots: slot k starts at k * period and lasts `lifetime` seconds.
// Returns the range of slot indices alive at time t.
export function activeSlots(t, period, lifetime) {
  return {
    first: Math.floor((t - lifetime) / period) + 1,
    last: Math.floor(t / period),
  };
}
