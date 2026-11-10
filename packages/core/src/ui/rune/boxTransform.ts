/** Two-dimensional affine transform, in canvas order. @internal */
export type BoxTransform = readonly [number, number, number, number, number, number];
/** A box in viewport coordinates. @internal */
export type RuneBoxRect = readonly [number, number, number, number];

/** The transform Rune paints around a box's origin, including percentage offsets. @internal */
export function boxTransform(rect: RuneBoxRect, transform: unknown, origin: unknown): BoxTransform {
  if (!Array.isArray(transform)) return [1, 0, 0, 1, 0, 0];
  const number = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const angle = number(transform[2]);
  const scale = number(transform[3], 1);
  const a = Math.cos(angle) * scale;
  const b = Math.sin(angle) * scale;
  const c = -b;
  const d = a;
  const ox = rect[0] + (Array.isArray(origin) ? number(origin[0], 0.5) : 0.5) * rect[2];
  const oy = rect[1] + (Array.isArray(origin) ? number(origin[1], 0.5) : 0.5) * rect[3];
  return [a, b, c, d, ox - a * ox - c * oy + number(transform[0]) + number(transform[4]) * rect[2], oy - b * ox - d * oy + number(transform[1]) + number(transform[5]) * rect[3]];
}

/** Compose a child's transform under the transforms of its ancestors. @internal */
export function composeBoxTransform(parent: BoxTransform, child: BoxTransform): BoxTransform {
  const [a, b, c, d, x, y] = parent;
  const [e, f, g, h, u, v] = child;
  return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h, a * u + c * v + x, b * u + d * v + y];
}

/** Bounds of the painted box, for DOM measurement and pointer hit testing. @internal */
export function transformedBoxRect(rect: RuneBoxRect, matrix: BoxTransform): [number, number, number, number] {
  const [a, b, c, d, tx, ty] = matrix;
  const [x, y, w, h] = rect;
  const left = a * x + c * y + tx;
  const top = b * x + d * y + ty;
  const dx = a * w;
  const dy = c * h;
  const ex = b * w;
  const ey = d * h;
  return [left + Math.min(0, dx) + Math.min(0, dy), top + Math.min(0, ex) + Math.min(0, ey), Math.abs(dx) + Math.abs(dy), Math.abs(ex) + Math.abs(ey)];
}
