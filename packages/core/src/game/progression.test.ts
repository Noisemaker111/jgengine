import { describe, expect, test } from "bun:test";
import { curve, evalCurve, leveling, type LevelingStatAccess } from "@jgengine/core/game/progression";

describe("evalCurve shapes", () => {
  test("const ignores input", () => {
    expect(evalCurve({ kind: "const", value: 7 }, 99)).toBe(7);
  });

  test("linear scales speed by level", () => {
    const moveSpeed = curve({ kind: "linear", base: 5, per: 0.25 });
    expect(moveSpeed(0)).toBe(5);
    expect(moveSpeed(20)).toBe(10);
  });

  test("power drives an xp requirement", () => {
    expect(evalCurve({ kind: "power", base: 100, exponent: 1.55, round: "floor" }, 1)).toBe(100);
    expect(evalCurve({ kind: "power", base: 80, exponent: 1.4, round: "floor" }, 1)).toBe(80);
  });

  test("geometric scales enemy difficulty per wave", () => {
    const hp = curve({ kind: "geometric", base: 100, ratio: 1.2, round: "round" });
    expect(hp(0)).toBe(100);
    expect(hp(1)).toBe(120);
    expect(hp(2)).toBe(144);
  });

  test("steps reads a discrete difficulty table, clamped to ends", () => {
    const tier = curve({ kind: "steps", values: [1, 2, 4, 8] });
    expect(tier(0)).toBe(1);
    expect(tier(2)).toBe(4);
    expect(tier(9)).toBe(8);
    expect(tier(-3)).toBe(1);
  });

  test("piecewise interpolates a loot drop-rate ramp with min/max clamps", () => {
    const dropRate = curve({
      kind: "piecewise",
      points: [
        [0, 0.05],
        [50, 0.4],
        [100, 0.9],
      ],
      min: 0.05,
      max: 0.9,
    });
    expect(dropRate(0)).toBeCloseTo(0.05);
    expect(dropRate(25)).toBeCloseTo(0.225);
    expect(dropRate(75)).toBeCloseTo(0.65);
    expect(dropRate(1000)).toBeCloseTo(0.9);
  });
});

describe("leveling.resolve", () => {
  const track = leveling({
    xpForLevel: { kind: "power", base: 100, exponent: 1.55, round: "floor" },
    maxLevel: 60,
  });

  test("keeps level when xp is below the threshold", () => {
    expect(track.resolve(1, 50)).toEqual({ level: 1, xp: 50, xpMax: 100, levelsGained: 0 });
  });

  test("levels up once and carries the remainder", () => {
    const progress = track.resolve(1, 130);
    expect(progress.level).toBe(2);
    expect(progress.xp).toBe(30);
    expect(progress.xpMax).toBe(track.xpForLevel(2));
    expect(progress.levelsGained).toBe(1);
  });

  test("chains multiple level-ups from one grant", () => {
    const total = track.xpForLevel(1) + track.xpForLevel(2) + 10;
    const progress = track.resolve(1, total);
    expect(progress.level).toBe(3);
    expect(progress.xp).toBe(10);
    expect(progress.levelsGained).toBe(2);
  });

  test("zeroes xp at the level cap", () => {
    const progress = track.resolve(59, 10_000_000);
    expect(progress.level).toBe(60);
    expect(progress.xp).toBe(0);
  });
});

describe("leveling.resolve with cumulative thresholds", () => {
  const track = leveling({
    xpForLevel: { kind: "power", base: 200, exponent: 1.8, round: "floor" },
    maxLevel: 10,
    thresholdMode: "cumulative",
  });

  test("xpForLevel is zero at and below startLevel, and a total at level 5 matches the curve", () => {
    expect(track.xpForLevel(1)).toBe(0);
    expect(track.xpForLevel(5)).toBe(3623);
  });

  test("keeps level when total xp is below the next threshold", () => {
    const progress = track.resolve(1, 500);
    expect(progress.level).toBe(1);
    expect(progress.xp).toBe(500);
    expect(progress.xpMax).toBe(track.xpForLevel(2));
    expect(progress.levelsGained).toBe(0);
  });

  test("reaches level 5 exactly at its cumulative total", () => {
    const progress = track.resolve(1, track.xpForLevel(5));
    expect(progress.level).toBe(5);
    expect(progress.xp).toBe(track.xpForLevel(5));
    expect(progress.xpMax).toBe(track.xpForLevel(6));
    expect(progress.levelsGained).toBe(4);
  });

  test("chains multiple level-ups from one grant without internal summing", () => {
    const progress = track.resolve(1, track.xpForLevel(5) + 10);
    expect(progress.level).toBe(5);
    expect(progress.xp).toBe(track.xpForLevel(5) + 10);
    expect(progress.levelsGained).toBe(4);
  });

  test("caps at maxLevel and clamps xp to the cap's total", () => {
    const progress = track.resolve(1, 10_000_000);
    expect(progress.level).toBe(10);
    expect(progress.xp).toBe(track.xpForLevel(10));
    expect(progress.xpMax).toBe(track.xpForLevel(10));
  });
});

describe("leveling.grantXp with cumulative thresholds", () => {
  function fakeAccess(initial: Record<string, { current: number; max: number }>): {
    access: LevelingStatAccess;
    pools: Record<string, { current: number; max: number }>;
  } {
    const pools = { ...initial };
    return {
      pools,
      access: {
        get: (_userId, statId) => pools[statId] ?? null,
        set: (_userId, statId, patch) => {
          const existing = pools[statId] ?? { current: 0, max: 0 };
          pools[statId] = {
            current: patch.current ?? existing.current,
            max: patch.max ?? existing.max,
          };
        },
      },
    };
  }

  const track = leveling({
    xpForLevel: { kind: "power", base: 200, exponent: 1.8, round: "floor" },
    maxLevel: 10,
    thresholdMode: "cumulative",
  });

  test("grants accumulate as a running total and cross several levels at once", () => {
    const { access, pools } = fakeAccess({
      xp: { current: 0, max: track.xpForLevel(2) },
      level: { current: 1, max: 10 },
    });
    const seen: number[] = [];
    const gained = track.grantXp(access, "p1", track.xpForLevel(5) + 10, (lvl) => seen.push(lvl));
    expect(gained).toBe(4);
    expect(pools.level.current).toBe(5);
    expect(pools.xp.current).toBe(track.xpForLevel(5) + 10);
    expect(seen).toEqual([5]);
  });

  test("a large grant caps at maxLevel and clamps the xp stat to the cap total", () => {
    const { access, pools } = fakeAccess({
      xp: { current: 0, max: track.xpForLevel(2) },
      level: { current: 1, max: 10 },
    });
    const gained = track.grantXp(access, "p1", 10_000_000);
    expect(gained).toBe(9);
    expect(pools.level.current).toBe(10);
    expect(pools.xp.current).toBe(track.xpForLevel(10));
    expect(pools.xp.max).toBe(track.xpForLevel(10));
  });
});

describe("leveling.grantXp", () => {
  function fakeAccess(initial: Record<string, { current: number; max: number }>): {
    access: LevelingStatAccess;
    pools: Record<string, { current: number; max: number }>;
  } {
    const pools = { ...initial };
    return {
      pools,
      access: {
        get: (_userId, statId) => pools[statId] ?? null,
        set: (_userId, statId, patch) => {
          const existing = pools[statId] ?? { current: 0, max: 0 };
          pools[statId] = {
            current: patch.current ?? existing.current,
            max: patch.max ?? existing.max,
          };
        },
      },
    };
  }

  const track = leveling({
    xpForLevel: { kind: "power", base: 80, exponent: 1.4, round: "floor" },
    maxLevel: 30,
  });

  test("advances the level stat and fires onLevelUp", () => {
    const { access, pools } = fakeAccess({
      xp: { current: 0, max: 80 },
      level: { current: 1, max: 30 },
    });
    const seen: number[] = [];
    const gained = track.grantXp(access, "p1", 200, (lvl) => seen.push(lvl));
    expect(gained).toBeGreaterThan(0);
    expect(pools.level.current).toBe(1 + gained);
    expect(seen).toEqual([pools.level.current]);
  });

  test("no level-up leaves the level stat and stays silent", () => {
    const { access, pools } = fakeAccess({
      xp: { current: 0, max: 80 },
      level: { current: 1, max: 30 },
    });
    const seen: number[] = [];
    const gained = track.grantXp(access, "p1", 10, (lvl) => seen.push(lvl));
    expect(gained).toBe(0);
    expect(pools.level.current).toBe(1);
    expect(pools.xp.current).toBe(10);
    expect(seen).toEqual([]);
  });

  test("is a no-op when the pools are missing", () => {
    const { access } = fakeAccess({ xp: { current: 0, max: 80 } });
    expect(track.grantXp(access, "p1", 999)).toBe(0);
  });
});
