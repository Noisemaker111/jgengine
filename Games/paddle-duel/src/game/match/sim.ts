import {
  COURT_H,
  MAX_BOUNCE_ANGLE,
  MAX_SPEED,
  PADDLE_HALF,
  SERVE_ALTERNATE_EVERY,
  VOLLEY_SPEEDUP,
  WIN_SCORE,
} from "../rules";
import type { Side } from "./state";

export interface Velocity {
  vx: number;
  vy: number;
}

export function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function paddleBounce(
  ballY: number,
  paddleY: number,
  halfH: number,
  speed: number,
  dir: number,
  maxAngle: number = MAX_BOUNCE_ANGLE,
): Velocity {
  const offset = clamp((ballY - paddleY) / halfH, -1, 1);
  const angle = offset * maxAngle;
  return { vx: dir * speed * Math.cos(angle), vy: speed * Math.sin(angle) };
}

export function speedUp(speed: number, factor: number = VOLLEY_SPEEDUP, max: number = MAX_SPEED): number {
  return Math.min(speed * factor, max);
}

export function matchWinner(scoreL: number, scoreR: number, target: number = WIN_SCORE): Side | null {
  if (scoreL >= target && scoreL - scoreR >= 2) return "L";
  if (scoreR >= target && scoreR - scoreL >= 2) return "R";
  return null;
}

export function isMatchPoint(scoreFor: number, scoreAgainst: number, target: number = WIN_SCORE): boolean {
  const next = scoreFor + 1;
  return next >= target && next - scoreAgainst >= 2;
}

export function serverFor(totalPoints: number, firstServer: Side, every: number = SERVE_ALTERNATE_EVERY): Side {
  const swaps = Math.floor(totalPoints / every);
  const flipped = swaps % 2 === 1;
  if (!flipped) return firstServer;
  return firstServer === "L" ? "R" : "L";
}

export function clampPaddleY(y: number, halfH: number = PADDLE_HALF, courtH: number = COURT_H): number {
  return clamp(y, halfH, courtH - halfH);
}

export function stepToward(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}
