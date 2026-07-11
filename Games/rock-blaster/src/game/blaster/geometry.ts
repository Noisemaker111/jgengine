export const TAU = Math.PI * 2;

export function wrap(value: number, max: number): number {
  const m = ((value % max) + max) % max;
  return m;
}

export function headingX(angle: number): number {
  return Math.sin(angle);
}

export function headingY(angle: number): number {
  return -Math.cos(angle);
}

export function stepPosition(
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
  w: number,
  h: number,
): readonly [number, number] {
  return [wrap(x + vx * dt, w), wrap(y + vy * dt, h)];
}

export function applyThrust(
  vx: number,
  vy: number,
  angle: number,
  accel: number,
  dt: number,
  maxSpeed: number,
): readonly [number, number] {
  let nvx = vx + headingX(angle) * accel * dt;
  let nvy = vy + headingY(angle) * accel * dt;
  const speed = Math.hypot(nvx, nvy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    nvx *= scale;
    nvy *= scale;
  }
  return [nvx, nvy];
}

export function speedOf(vx: number, vy: number): number {
  return Math.hypot(vx, vy);
}

/** Shortest toroidal delta from a to b on an axis of length max, in [-max/2, max/2). */
export function wrapDelta(a: number, b: number, max: number): number {
  let d = (b - a) % max;
  if (d < -max / 2) d += max;
  else if (d >= max / 2) d -= max;
  return d;
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** Toroidal circle overlap — the shortest wrap-aware distance across all edges. */
export function circlesOverlapWrapped(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
  w: number,
  h: number,
): boolean {
  const dx = wrapDelta(ax, bx, w);
  const dy = wrapDelta(ay, by, h);
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}
