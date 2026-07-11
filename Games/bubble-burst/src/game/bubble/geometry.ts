import { AIM_MAX, AIM_MIN, FIELD_W, R } from "./constants";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function aimToDir(angle: number): Vec2 {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

export function clampAim(angle: number): number {
  if (angle < AIM_MIN) return AIM_MIN;
  if (angle > AIM_MAX) return AIM_MAX;
  return angle;
}

/** Aim angle (radians from straight up) toward a point, clamped to the cannon arc. */
export function aimFromPoint(px: number, py: number, sx: number, sy: number): number {
  return clampAim(Math.atan2(px - sx, sy - py));
}

/** Reflect a horizontal step off the side walls; returns the clamped x and flipped vx. */
export function bounceX(x: number, vx: number): { x: number; vx: number } {
  if (x < R) return { x: R, vx: Math.abs(vx) };
  if (x > FIELD_W - R) return { x: FIELD_W - R, vx: -Math.abs(vx) };
  return { x, vx };
}
