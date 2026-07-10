export type Vec2 = readonly [number, number];

export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function vecDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function catmullRomAxis(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

export function catmullRomPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  return [catmullRomAxis(p0[0], p1[0], p2[0], p3[0], t), catmullRomAxis(p0[1], p1[1], p2[1], p3[1], t)];
}

export function closedCatmullRomLoop(controlPoints: readonly Vec2[], samplesPerSegment: number): Vec2[] {
  const n = controlPoints.length;
  const points: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = controlPoints[(i - 1 + n) % n]!;
    const p1 = controlPoints[i]!;
    const p2 = controlPoints[(i + 1) % n]!;
    const p3 = controlPoints[(i + 2) % n]!;
    for (let s = 0; s < samplesPerSegment; s += 1) {
      points.push(catmullRomPoint(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }
  return points;
}

export function loopNormalAt(loop: readonly Vec2[], index: number): Vec2 {
  const n = loop.length;
  const a = loop[(index - 1 + n) % n]!;
  const b = loop[(index + 1) % n]!;
  const tx = b[0] - a[0];
  const tz = b[1] - a[1];
  const len = Math.hypot(tx, tz) || 1;
  return [-tz / len, tx / len];
}

export function loopTangentAt(loop: readonly Vec2[], index: number): Vec2 {
  const n = loop.length;
  const a = loop[(index - 1 + n) % n]!;
  const b = loop[(index + 1) % n]!;
  const tx = b[0] - a[0];
  const tz = b[1] - a[1];
  const len = Math.hypot(tx, tz) || 1;
  return [tx / len, tz / len];
}

export function offsetPoint(base: Vec2, normal: Vec2, distance: number): Vec2 {
  return [base[0] + normal[0] * distance, base[1] + normal[1] * distance];
}

export function headingFromTangent(tangent: Vec2): number {
  return Math.atan2(tangent[0], tangent[1]);
}
