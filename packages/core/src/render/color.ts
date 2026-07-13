/** Split a `#rrggbb` hex color into its `[r, g, b]` channels (0–255). */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Combine `[r, g, b]` channels (0–255, rounded) into a `#rrggbb` hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const value = ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
  return `#${value.toString(16).padStart(6, "0")}`;
}

/** Interpolate between two `#rrggbb` colors by fraction `t`, clamped to the endpoints. */
export function mixHex(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  return rgbToHex(fr + (tr - fr) * t, fg + (tg - fg) * t, fb + (tb - fb) * t);
}
