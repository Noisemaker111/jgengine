import { describe, expect, test } from "bun:test";

import { seededRng } from "@jgengine/core/random/rng";

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
  ROCK_SMALL,
  SAFE_RADIUS,
} from "./constants";
import {
  aimAngle,
  canFire,
  isBulletExpired,
  isCenterClear,
  makeBullet,
  makeRock,
  saucerAimSpread,
  scoreForRock,
  splitRock,
  type Rock,
} from "./logic";

describe("split cascade counts and scoring", () => {
  test("each size splits into the right children", () => {
    const rng = seededRng("split");
    const large = makeRock(100, 100, ROCK_LARGE, rng);
    const medium = makeRock(100, 100, ROCK_MEDIUM, rng);
    const small = makeRock(100, 100, ROCK_SMALL, rng);
    const largeKids = splitRock(large, rng);
    const mediumKids = splitRock(medium, rng);
    expect(largeKids.length).toBe(2);
    expect(largeKids.every((r) => r.size === ROCK_MEDIUM)).toBe(true);
    expect(mediumKids.length).toBe(2);
    expect(mediumKids.every((r) => r.size === ROCK_SMALL)).toBe(true);
    expect(splitRock(small, rng).length).toBe(0);
  });

  test("scoring: 20 / 50 / 100 by size", () => {
    expect(scoreForRock(ROCK_LARGE)).toBe(20);
    expect(scoreForRock(ROCK_MEDIUM)).toBe(50);
    expect(scoreForRock(ROCK_SMALL)).toBe(100);
  });

  test("fully clearing one large yields 7 rocks and 520 points", () => {
    const rng = seededRng("cascade");
    const queue: Rock[] = [makeRock(100, 100, ROCK_LARGE, rng)];
    let destroyed = 0;
    let total = 0;
    while (queue.length > 0) {
      const rock = queue.shift()!;
      destroyed += 1;
      total += scoreForRock(rock.size);
      for (const child of splitRock(rock, rng)) queue.push(child);
    }
    expect(destroyed).toBe(7);
    expect(total).toBe(20 + 2 * 50 + 4 * 100);
    expect(total).toBe(520);
  });
});

describe("shot lifetime and 4-shot cap", () => {
  test("cannot fire beyond MAX_BULLETS alive or while cooling down", () => {
    expect(canFire(0, 0)).toBe(true);
    expect(canFire(3, 0)).toBe(true);
    expect(canFire(4, 0)).toBe(false);
    expect(canFire(MAX_BULLETS, 0)).toBe(false);
    expect(canFire(2, 0.05)).toBe(false);
  });

  test("a shot expires once it has travelled its range", () => {
    const bullet = makeBullet(0, 0, Math.PI / 2, 520, 0, 0, BULLET_RANGE, true);
    expect(isBulletExpired(bullet)).toBe(false);
    let dist = 0;
    for (let i = 0; i < 10; i += 1) dist += Math.hypot(bullet.vx, bullet.vy) * 0.1;
    bullet.dist = dist;
    expect(bullet.dist).toBeCloseTo(BULLET_RANGE, 1);
    expect(isBulletExpired(bullet)).toBe(true);
    expect(isBulletExpired({ ...bullet, dist: BULLET_RANGE - 1 })).toBe(false);
    expect(isBulletExpired({ ...bullet, dist: BULLET_RANGE })).toBe(true);
  });
});

describe("safe-respawn check", () => {
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;

  test("clear when nothing is near the center", () => {
    expect(isCenterClear([], cx, cy, SAFE_RADIUS)).toBe(true);
    expect(isCenterClear([{ x: 50, y: 50, radius: 20 }], cx, cy, SAFE_RADIUS)).toBe(true);
  });

  test("blocked when a hazard overlaps the safe circle", () => {
    expect(isCenterClear([{ x: cx, y: cy, radius: 20 }], cx, cy, SAFE_RADIUS)).toBe(false);
    expect(isCenterClear([{ x: cx + SAFE_RADIUS + 10, y: cy, radius: 20 }], cx, cy, SAFE_RADIUS)).toBe(false);
    expect(isCenterClear([{ x: cx + SAFE_RADIUS + 30, y: cy, radius: 20 }], cx, cy, SAFE_RADIUS)).toBe(true);
  });
});

describe("saucer aim tightening", () => {
  test("spread starts wide and tightens toward the floor as score rises", () => {
    expect(saucerAimSpread(0)).toBeCloseTo(AIM_SPREAD_MAX);
    expect(saucerAimSpread(AIM_SPREAD_FLOOR_SCORE)).toBeCloseTo(AIM_SPREAD_MIN);
    const s0 = saucerAimSpread(0);
    const s1 = saucerAimSpread(10000);
    const s2 = saucerAimSpread(30000);
    expect(s0).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThan(s2);
  });

  test("spread never drops below the floor past the cap score", () => {
    expect(saucerAimSpread(AIM_SPREAD_FLOOR_SCORE * 2)).toBeCloseTo(AIM_SPREAD_MIN);
    expect(saucerAimSpread(1_000_000)).toBeGreaterThanOrEqual(AIM_SPREAD_MIN);
  });

  test("with zero spread the aim points straight at the target", () => {
    const angle = aimAngle(0, 0, 100, 0, 0, () => 0.5);
    expect(angle).toBeCloseTo(0, 6);
  });
});
