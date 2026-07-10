import { MAX_BOUNCE_DEG, MIN_VERTICAL_DIR } from "./constants";

export interface Vec2 {
  x: number;
  y: number;
}

export interface RectHit {
  hit: boolean;
  nx: number;
  ny: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function normalize(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: -1 };
  return { x: x / len, y: y / len };
}

/**
 * Paddle reflection: `offset` is the horizontal hit position relative to the
 * paddle centre in [-1, 1]. Centre hits leave nearly vertical; edge hits steer
 * toward `MAX_BOUNCE_DEG` off vertical (steeper, more horizontal). Returns an
 * upward unit direction.
 */
export function paddleBounceDir(offset: number): Vec2 {
  const clamped = clamp(offset, -1, 1);
  const angle = clamped * (MAX_BOUNCE_DEG * (Math.PI / 180));
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** Rotate a direction by `degrees` (clockwise in screen space). Preserves magnitude. */
export function rotate(dir: Vec2, degrees: number): Vec2 {
  const rad = degrees * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos };
}

/**
 * Circle vs axis-aligned rectangle. Returns whether they overlap and, if so, an
 * axis-aligned collision normal (pointing from the rectangle toward the circle
 * centre) used to reflect the ball. Deep overlaps resolve along the shallowest
 * penetration axis so a ball buried in a brick still exits sensibly.
 */
export function circleRectHit(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): RectHit {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  if (dx * dx + dy * dy > r * r) return { hit: false, nx: 0, ny: 0 };

  if (dx === 0 && dy === 0) {
    const left = cx - rx;
    const right = rx + rw - cx;
    const top = cy - ry;
    const bottom = ry + rh - cy;
    const minH = Math.min(left, right);
    const minV = Math.min(top, bottom);
    if (minH < minV) return { hit: true, nx: left < right ? -1 : 1, ny: 0 };
    return { hit: true, nx: 0, ny: top < bottom ? -1 : 1 };
  }

  if (Math.abs(dx) >= Math.abs(dy)) return { hit: true, nx: Math.sign(dx), ny: 0 };
  return { hit: true, nx: 0, ny: Math.sign(dy) };
}

/** Reflect a unit direction off an axis-aligned normal, forcing it to point away from the surface. */
export function reflect(dir: Vec2, nx: number, ny: number): Vec2 {
  const out = { x: dir.x, y: dir.y };
  if (nx !== 0) out.x = Math.abs(dir.x) * Math.sign(nx);
  if (ny !== 0) out.y = Math.abs(dir.y) * Math.sign(ny);
  return enforceVertical(out);
}

/** Keep a minimum vertical component so the ball never settles into an endless horizontal loop. */
export function enforceVertical(dir: Vec2): Vec2 {
  const unit = normalize(dir.x, dir.y);
  if (Math.abs(unit.y) >= MIN_VERTICAL_DIR) return unit;
  const ySign = unit.y >= 0 ? 1 : -1;
  const xSign = unit.x >= 0 ? 1 : -1;
  const x = xSign * Math.sqrt(Math.max(0, 1 - MIN_VERTICAL_DIR * MIN_VERTICAL_DIR));
  return { x, y: ySign * MIN_VERTICAL_DIR };
}
