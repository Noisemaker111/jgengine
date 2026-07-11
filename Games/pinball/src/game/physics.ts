import type { Ball, Barrier, Bumper, DropTarget, Flipper, Wall } from "./types";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function speed(b: Ball): number {
  return Math.hypot(b.vx, b.vy);
}

export function clampSpeed(b: Ball, max: number): void {
  const s = Math.hypot(b.vx, b.vy);
  if (s > max) {
    const k = max / s;
    b.vx *= k;
    b.vy *= k;
  }
}

export interface Closest {
  qx: number;
  qy: number;
  t: number;
}

export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): Closest {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  const t = l2 > 0 ? clamp(((px - ax) * abx + (py - ay) * aby) / l2, 0, 1) : 0;
  return { qx: ax + t * abx, qy: ay + t * aby, t };
}

function reflectAlong(b: Ball, nx: number, ny: number, e: number): void {
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
}

/** Circle vs a fixed point (segment endpoint / post). */
function collidePoint(b: Ball, px: number, py: number, e: number): boolean {
  const dx = b.x - px;
  const dy = b.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= b.r || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  b.x = px + nx * b.r;
  b.y = py + ny * b.r;
  reflectAlong(b, nx, ny, e);
  return true;
}

/**
 * Circle vs a one-sided wall with a precomputed outward (interior-facing)
 * normal. Signed-distance repositioning makes this tunnel-proof: any crossing
 * (signed distance below the radius, including negative) snaps the ball back to
 * the interior side, so a ball at any speed can never end up behind the wall.
 * Returns whether a contact was resolved.
 */
export function collideWall(b: Ball, w: Wall): boolean {
  const abx = w.bx - w.ax;
  const aby = w.by - w.ay;
  const l2 = abx * abx + aby * aby;
  const proj = l2 > 0 ? ((b.x - w.ax) * abx + (b.y - w.ay) * aby) / l2 : 0;
  if (proj < 0) return collidePoint(b, w.ax, w.ay, w.e);
  if (proj > 1) return collidePoint(b, w.bx, w.by, w.e);
  const sd = (b.x - w.ax) * w.nx + (b.y - w.ay) * w.ny;
  if (sd >= b.r) return false;
  b.x += (b.r - sd) * w.nx;
  b.y += (b.r - sd) * w.ny;
  reflectAlong(b, w.nx, w.ny, w.e);
  if (w.kick !== undefined) {
    b.vx += w.nx * w.kick;
    b.vy += w.ny * w.kick;
  }
  return true;
}

/** Circle vs circle with an outward kick impulse (pop bumper). */
export function collideDisc(b: Ball, cx: number, cy: number, cr: number, e: number, kick: number): boolean {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const rr = b.r + cr;
  const d = Math.hypot(dx, dy);
  if (d >= rr) return false;
  const nx = d > 1e-6 ? dx / d : 0;
  const ny = d > 1e-6 ? dy / d : -1;
  b.x = cx + nx * rr;
  b.y = cy + ny * rr;
  reflectAlong(b, nx, ny, e);
  if (kick !== 0) {
    b.vx += nx * kick;
    b.vy += ny * kick;
  }
  return true;
}

export function collideBumper(b: Ball, bump: Bumper): boolean {
  return collideDisc(b, bump.x, bump.y, bump.r, bump.e, bump.kick);
}

/** Circle vs a two-sided capsule (static barrier). Geometric normal resolves from whichever side the centre sits on. */
export function collideBarrier(b: Ball, ax: number, ay: number, bx: number, by: number, capR: number, e: number): boolean {
  const { qx, qy } = closestOnSegment(b.x, b.y, ax, ay, bx, by);
  const dx = b.x - qx;
  const dy = b.y - qy;
  const rr = b.r + capR;
  const d = Math.hypot(dx, dy);
  if (d >= rr) return false;
  let nx: number;
  let ny: number;
  if (d > 1e-6) {
    nx = dx / d;
    ny = dy / d;
  } else {
    const vl = Math.hypot(b.vx, b.vy) || 1;
    nx = -b.vx / vl;
    ny = -b.vy / vl;
  }
  b.x = qx + nx * rr;
  b.y = qy + ny * rr;
  reflectAlong(b, nx, ny, e);
  return true;
}

export function collideBarrierObj(b: Ball, bar: Barrier): boolean {
  return collideBarrier(b, bar.ax, bar.ay, bar.bx, bar.by, bar.capR, bar.e);
}

export function collideDropTarget(b: Ball, d: DropTarget, e: number): boolean {
  return collideBarrier(b, d.ax, d.ay, d.bx, d.by, d.capR, e);
}

export function flipperTip(f: Flipper): { tx: number; ty: number } {
  return { tx: f.px + Math.cos(f.angle) * f.len, ty: f.py + Math.sin(f.angle) * f.len };
}

/**
 * Circle vs a rotating capsule (flipper). The impulse is resolved against the
 * ball's velocity *relative to the flipper surface* at the contact point
 * (surface velocity = omega x r about the pivot), so a moving flipper imparts
 * real energy — a fast upswing launches a resting ball, a still flipper only
 * bounces it. Returns whether a contact was resolved.
 */
export function collideFlipper(b: Ball, f: Flipper, e: number): boolean {
  const { tx, ty } = flipperTip(f);
  const { qx, qy } = closestOnSegment(b.x, b.y, f.px, f.py, tx, ty);
  const dx = b.x - qx;
  const dy = b.y - qy;
  const rr = b.r + f.capR;
  const d = Math.hypot(dx, dy);
  if (d >= rr) return false;
  const nx = d > 1e-6 ? dx / d : 0;
  const ny = d > 1e-6 ? dy / d : -1;
  b.x = qx + nx * rr;
  b.y = qy + ny * rr;
  const rx = qx - f.px;
  const ry = qy - f.py;
  const svx = -f.omega * ry;
  const svy = f.omega * rx;
  const rvn = (b.vx - svx) * nx + (b.vy - svy) * ny;
  if (rvn < 0) {
    const j = -(1 + e) * rvn;
    b.vx += j * nx;
    b.vy += j * ny;
  }
  return true;
}

/** Advance a flipper angle one substep toward its target, recording the angular velocity used for contact impulses. */
export function advanceFlipper(f: Flipper, dt: number, raiseRate: number, lowerRate: number, locked: boolean): void {
  const target = f.up && !locked ? f.active : f.rest;
  const diff = target - f.angle;
  if (Math.abs(diff) < 1e-5) {
    f.omega = 0;
    return;
  }
  const raising = f.up && !locked;
  const rate = raising ? raiseRate : lowerRate;
  const step = Math.sign(diff) * rate * dt;
  if (Math.abs(step) >= Math.abs(diff)) {
    f.omega = diff / dt;
    f.angle = target;
  } else {
    f.omega = Math.sign(diff) * rate;
    f.angle += step;
  }
}
