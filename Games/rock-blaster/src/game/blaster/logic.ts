import {
  AIM_SPREAD_FLOOR_SCORE,
  AIM_SPREAD_MAX,
  AIM_SPREAD_MIN,
  BULLET_RANGE,
  FIELD_H,
  FIELD_W,
  MAX_BULLETS,
  ROCK_LARGE,
  ROCK_MEDIUM,
  ROCK_RADIUS,
  ROCK_SCORE,
  ROCK_SMALL,
  ROCK_SPEED,
} from "./constants";
import { TAU, wrap, wrapDelta } from "./geometry";

export type Phase = "start" | "playing" | "paused" | "gameover";
export type SaucerKind = "big" | "small";

export interface Controls {
  readonly left: boolean;
  readonly right: boolean;
  readonly thrust: boolean;
  readonly fire: boolean;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  thrusting: boolean;
  invuln: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  range: number;
  friendly: boolean;
}

export interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  radius: number;
  angle: number;
  spin: number;
  verts: readonly number[];
}

export interface Saucer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: SaucerKind;
  radius: number;
  fireTimer: number;
  jinkTimer: number;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export function scoreForRock(size: number): number {
  return ROCK_SCORE[size] ?? 0;
}

export function childSizeFor(size: number): number | null {
  if (size === ROCK_LARGE) return ROCK_MEDIUM;
  if (size === ROCK_MEDIUM) return ROCK_SMALL;
  return null;
}

function rockShape(rng: () => number): number[] {
  const count = 10 + Math.floor(rng() * 4);
  const verts: number[] = [];
  for (let i = 0; i < count; i += 1) verts.push(0.74 + rng() * 0.42);
  return verts;
}

export function makeRock(x: number, y: number, size: number, rng: () => number): Rock {
  const [lo, hi] = ROCK_SPEED[size] ?? [40, 80];
  const dir = rng() * TAU;
  const speed = lo + rng() * (hi - lo);
  return {
    x,
    y,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    size,
    radius: ROCK_RADIUS[size] ?? 20,
    angle: rng() * TAU,
    spin: (rng() - 0.5) * 2.2,
    verts: rockShape(rng),
  };
}

/** Splitting a destroyed rock into its children: large→2 medium, medium→2 small, small→none. */
export function splitRock(rock: Rock, rng: () => number): Rock[] {
  const childSize = childSizeFor(rock.size);
  if (childSize === null) return [];
  const children: Rock[] = [];
  for (let i = 0; i < 2; i += 1) children.push(makeRock(rock.x, rock.y, childSize, rng));
  return children;
}

export function rockCountForWave(wave: number): number {
  return Math.min(3 + wave, 11);
}

/** Large rocks for a fresh wave, seeded off screen edges so none starts on the ship's center. */
export function spawnWaveRocks(wave: number, rng: () => number): Rock[] {
  const count = rockCountForWave(wave);
  const rocks: Rock[] = [];
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  for (let i = 0; i < count; i += 1) {
    let x = rng() * FIELD_W;
    let y = rng() * FIELD_H;
    if (Math.hypot(x - cx, y - cy) < 160) {
      x = wrap(x + FIELD_W / 2, FIELD_W);
      y = wrap(y + FIELD_H / 2, FIELD_H);
    }
    rocks.push(makeRock(x, y, ROCK_LARGE, rng));
  }
  return rocks;
}

/** Aim spread for the small saucer: wide when the score is low, tightening toward a floor as it climbs. */
export function saucerAimSpread(score: number): number {
  const t = Math.min(1, Math.max(0, score / AIM_SPREAD_FLOOR_SCORE));
  return Math.max(AIM_SPREAD_MIN, AIM_SPREAD_MAX - (AIM_SPREAD_MAX - AIM_SPREAD_MIN) * t);
}

export function aimAngle(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  spread: number,
  rng: () => number,
): number {
  const dx = wrapDelta(fromX, toX, FIELD_W);
  const dy = wrapDelta(fromY, toY, FIELD_H);
  const base = Math.atan2(dy, dx);
  return base + (rng() - 0.5) * spread;
}

export function canFire(bulletCount: number, cooldown: number): boolean {
  return bulletCount < MAX_BULLETS && cooldown <= 0;
}

export function isBulletExpired(bullet: Bullet): boolean {
  return bullet.dist >= bullet.range;
}

export function makeBullet(
  x: number,
  y: number,
  angle: number,
  speed: number,
  extraVx: number,
  extraVy: number,
  range: number,
  friendly: boolean,
): Bullet {
  return {
    x,
    y,
    vx: Math.sin(angle) * speed + extraVx,
    vy: -Math.cos(angle) * speed + extraVy,
    dist: 0,
    range,
    friendly,
  };
}

export interface Hazard {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Safe-respawn gate: the spawn center must have no rock or saucer within `safeR`. */
export function isCenterClear(
  hazards: readonly Hazard[],
  cx: number,
  cy: number,
  safeR: number,
): boolean {
  for (const h of hazards) {
    const dx = wrapDelta(cx, h.x, FIELD_W);
    const dy = wrapDelta(cy, h.y, FIELD_H);
    const r = safeR + h.radius;
    if (dx * dx + dy * dy <= r * r) return false;
  }
  return true;
}

export const BULLET_MAX_RANGE = BULLET_RANGE;
