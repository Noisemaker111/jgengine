// Pure timing/geometry helpers for the round state machine — no engine imports.

import { idx } from "./board";

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Seconds remaining on a countdown (never negative). */
export function countdownRemaining(now: number, start: number, total: number): number {
  const left = total - (now - start);
  return left < 0 ? 0 : left;
}

/** 0 at the start of the countdown, 1 at GO. */
export function countdownFraction(now: number, start: number, total: number): number {
  if (total <= 0) return 1;
  return clamp01((now - start) / total);
}

/** The "3 / 2 / 1 / GO" pip for a countdown of `total` seconds. */
export function countdownPip(now: number, start: number, total: number): string {
  const remaining = countdownRemaining(now, start, total);
  if (remaining <= 0) return "GO!";
  return String(Math.ceil((remaining / total) * 3));
}

/** True once a falling body has reached the pit floor. */
export function isLanded(y: number, floorY: number, eps = 0.18): boolean {
  return y <= floorY + eps;
}

/** Eased vertical position for a scripted companion fall/rise. */
export function easeInFall(now: number, start: number, duration: number, topY: number, floorY: number): number {
  const t = clamp01((now - start) / duration);
  return lerp(topY, floorY, t * t); // accelerate downward
}

export function easeOutRise(now: number, start: number, duration: number, floorY: number, topY: number): number {
  const t = clamp01((now - start) / duration);
  return lerp(floorY, topY, 1 - (1 - t) * (1 - t)); // decelerate upward
}

/** Which board cell a world (x, z) is standing over, or null if off the grid / not centred on one. */
export function cellFromPosition(
  x: number,
  z: number,
  n: number,
  tolerance = 0.5,
): { col: number; row: number; index: number } | null {
  const col = Math.round(x);
  const row = Math.round(z);
  if (col < 0 || col >= n || row < 0 || row >= n) return null;
  if (Math.abs(x - col) > tolerance || Math.abs(z - row) > tolerance) return null;
  return { col, row, index: idx(n, col, row) };
}

/** Outward unit direction from the board centre to a point (for blast scatter). */
export function outwardDir(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
): { dx: number; dz: number } {
  const dx = x - centerX;
  const dz = z - centerZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) {
    // Dead centre: pick a deterministic diagonal so the blast still throws them clear.
    return { dx: Math.SQRT1_2, dz: Math.SQRT1_2 };
  }
  return { dx: dx / len, dz: dz / len };
}
