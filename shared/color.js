// OKLCH → sRGB. OKLCH is perceptually uniform: colors with the same L look
// equally bright whatever the hue, which makes it easy to rotate around the
// color wheel without some hues glaring and others vanishing.
//
//   oklch(lightness 0–1, chroma ~0–0.37, hue in degrees) → [r, g, b] in 0–255
export function oklch(L, C, hueDegrees) {
  const h = (hueDegrees * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((v) => {
    const c = Math.min(Math.max(v, 0), 1); // clip colors outside the sRGB gamut
    const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255);
  });
}

export function wrapHue(degrees) {
  return ((degrees % 360) + 360) % 360;
}
