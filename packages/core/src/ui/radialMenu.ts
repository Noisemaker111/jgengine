const TWO_PI = Math.PI * 2;

function normalize(angle: number): number {
  let value = angle % TWO_PI;
  if (value < 0) value += TWO_PI;
  return value;
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
 * Evenly divide a ring into `count` wedges, each centered on its index — the
 * geometry a radial/quick menu (weapon or emote wheel) renders. Angles run from
 * "up" (−Y) clockwise, so index 0 sits at the top.
 */
export function radialSlices(count: number): RadialSlice[] {
  if (count <= 0) return [];
  const size = TWO_PI / count;
  const slices: RadialSlice[] = [];
  for (let index = 0; index < count; index += 1) {
    const centerAngle = index * size;
    slices.push({
      index,
      centerAngle,
      startAngle: normalize(centerAngle - size / 2),
      endAngle: normalize(centerAngle + size / 2),
    });
  }
  return slices;
}

/** Map an angle (radians from up, clockwise) to the nearest of `count` slice indices. */
export function radialIndexFromAngle(angle: number, count: number): number {
  if (count <= 0) return -1;
  const size = TWO_PI / count;
  return Math.round(normalize(angle) / size) % count;
}

/** Options for {@link radialIndexFromVector}. */
export interface RadialVectorOptions {
  /** Minimum vector magnitude to register a selection; shorter vectors return null (the neutral center). Default 0. */
  deadZone?: number;
}

/**
 * Pick the slice a pointer/stick vector points at. `dx`/`dy` are screen-space
 * (y down): up is `(0, -1)`. Returns null inside `deadZone`, so a centered stick
 * or click selects nothing.
 *
 * @capability radial-select map a pointer/stick vector to a radial-menu slice index, with a neutral dead zone
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
  return radialIndexFromAngle(Math.atan2(dx, -dy), count);
}

/** Unit-circle position of a slice center (up = `(0, -1)`), scaled by `radius` — where to place a wedge's icon/label. */
export function radialSlicePosition(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = count <= 0 ? 0 : index * (TWO_PI / count);
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}
