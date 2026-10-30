import { clamp } from './clock.js';

// URL parameters every wallpaper understands. A wallpaper can add its own
// by passing an extra schema to run().
export const SHARED_SCHEMA = {
  seed: { type: 'string', default: 'wallpapers' },
  speed: { type: 'number', default: 1, min: 0.1, max: 20 },
  brightness: { type: 'number', default: 0.8, min: 0.05, max: 1 },
  fps: { type: 'number', default: 0, min: 0, max: 240 }, // 0 = display refresh rate
};

// Parses a query string (or URLSearchParams) against a schema of
// { name: { type: 'string' | 'number' | 'int', default, min, max } }.
// Missing or invalid values fall back to the default; numbers are clamped.
export function parseParams(search, schema) {
  const query = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out = {};
  for (const [name, spec] of Object.entries(schema)) {
    out[name] = coerce(query.get(name), spec);
  }
  return out;
}

function coerce(raw, spec) {
  if (raw === null || raw.trim() === '') return spec.default;
  if (spec.type === 'string') return raw.slice(0, spec.maxLength ?? 64);
  let value = Number(raw);
  if (!Number.isFinite(value)) return spec.default;
  if (spec.type === 'int') value = Math.round(value);
  return clamp(value, spec.min ?? -Infinity, spec.max ?? Infinity);
}
