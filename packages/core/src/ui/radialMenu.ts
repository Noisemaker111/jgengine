const TWO_PI = Math.PI * 2;

function normalize(angle: number): number {
  let value = angle % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
}

/**
 * Arc the slices span. Omit for a full wheel (index 0 at the top). A partial
 * `sweep` (e.g. `Math.PI` for a bottom half, `Math.PI / 2` for a quarter) packs
 * the slices evenly inside `[startAngle, startAngle + sweep]` — the arc/quick-bar
 * forms. Angles are radians from "up" (−Y), clockwise.
 */
export interface RadialArc {
  startAngle?: number;
  sweep?: number;
}

function arcConfig(count: number, arc: RadialArc | undefined): {
  startAngle: number;
  sweep: number;
  full: boolean;
  size: number;
  centerOf: (index: number) => number;
} {
  const startAngle = arc?.startAngle ?? 0;
  const sweep = arc?.sweep ?? TWO_PI;
  const full = sweep >= TWO_PI - 1e-6;
  const size = full ? (count > 0 ? TWO_PI / count : 0) : (count > 0 ? sweep / count : 0);
  // Full wheels wrap, so a slice sits exactly on the start angle (index 0 = top).
  // Partial arcs offset by half a slice so wedges fit inside the arc.
  const centerOf = (index: number): number => startAngle + (full ? index : index + 0.5) * size;
  return { startAngle, sweep, full, size, centerOf };
}

/** One wedge of a radial menu — geometry for rendering a slice. Angles are radians from "up" (−Y), clockwise. */
export interface RadialSlice {
  index: number;
  /** Angle at the slice's center. */
  centerAngle: number;
  /** Leading edge angle. */
  startAngle: number;
  /** Trailing edge angle. */
  endAngle: number;
}

/**
 * Divide a ring (or `arc`) into `count` wedges — the geometry a radial/quick
 * menu (weapon wheel, emote arc, ping bar) renders. A full wheel centers index 0
 * at the top; a partial `arc` packs the slices inside its sweep.
 */
export function radialSlices(count: number, arc?: RadialArc): RadialSlice[] {
  if (count <= 0) return [];
  const { size, centerOf } = arcConfig(count, arc);
  const slices: RadialSlice[] = [];
  for (let index = 0; index < count; index += 1) {
    const centerAngle = centerOf(index);
    slices.push({
      index,
      centerAngle: normalize(centerAngle),
      startAngle: normalize(centerAngle - size / 2),
      endAngle: normalize(centerAngle + size / 2),
    });
  }
  return slices;
}

/** Map an angle to a slice index; returns -1 when the angle falls outside a partial `arc`. */
export function radialIndexFromAngle(angle: number, count: number, arc?: RadialArc): number {
  if (count <= 0) return -1;
  const { full, size, startAngle, sweep } = arcConfig(count, arc);
  if (full) return Math.round(normalize(angle - startAngle) / size) % count;
  const rel = normalize(angle - startAngle);
  if (rel > sweep) return -1;
  return Math.max(0, Math.min(count - 1, Math.floor(rel / size)));
}

/** Options for {@link radialIndexFromVector}. */
export interface RadialVectorOptions extends RadialArc {
  /** Minimum vector magnitude to register a selection; shorter vectors return null (the neutral center). Default 0. */
  deadZone?: number;
}

/**
 * Pick the slice a pointer/stick vector points at. `dx`/`dy` are screen-space
 * (y down): up is `(0, -1)`. Returns null inside `deadZone` or (for a partial
 * `arc`) outside the arc, so a centered stick or a click off the arc selects
 * nothing.
 *
 * @capability radial-select map a pointer/stick vector to a radial-menu slice index, with a neutral dead zone and optional arc bounds
 */
export function radialIndexFromVector(
  dx: number,
  dy: number,
  count: number,
  options: RadialVectorOptions = {},
): number | null {
  if (count <= 0) return null;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < (options.deadZone ?? 0)) return null;
  // atan2(dx, -dy): 0 = up, increasing clockwise toward +x (right).
  const index = radialIndexFromAngle(Math.atan2(dx, -dy), count, options);
  return index < 0 ? null : index;
}

/** Unit-circle position of a slice center (up = `(0, -1)`), scaled by `radius` — where to place a wedge's icon/label. */
export function radialSlicePosition(index: number, count: number, radius: number, arc?: RadialArc): { x: number; y: number } {
  const { centerOf } = arcConfig(count, arc);
  const angle = count <= 0 ? 0 : centerOf(index);
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}
