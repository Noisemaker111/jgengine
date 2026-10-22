import { describe, expect, test } from "bun:test";

import type { LevelingStatAccess } from "../game/progression";
import { assertXpCurve, defineXpCurve } from "./xpCurve";

const power = defineXpCurve({ growth: "power", step: 100, growthRate: 1.5, maxLevel: 12, round: "floor" });

function adapter(level = 1, xp = 0): LevelingStatAccess & { ready(): { level: number; xp: number } } {
  const values = { level, xp };
  return {
    get(_userId, statId) {
      if (statId === "level") return { current: values.level, max: 12 };
      if (statId === "xp") return { current: values.xp, max: power.xpForLevel(values.level) };
      return null;
    },
    set(_userId, statId, patch) {
      const key = statId as "level" | "xp";
      if (patch.current !== undefined) values[key] = patch.current;
      return true;
    },
    ready() {
      return { level: values.level, xp: values.xp };
    },
  };
}

describe("xp curve data", () => {
  test("states its growth rule and cap", () => {
    expect(power.maxLevel).toBe(12);
    expect(power.startLevel).toBe(1);
    expect(power.rule).toContain("power");
    expect(power.rule).toContain("100 x level^1.5");
    expect(power.rule).toContain("levels 1-12");
    expect(power.def).toEqual({ growth: "power", step: 100, growthRate: 1.5, maxLevel: 12, startLevel: 1, round: "floor" });
  });

  test("power rule grows the threshold every level and stops at the cap", () => {
    expect(power.xpForLevel(1)).toBe(100);
    expect(power.xpForLevel(2)).toBe(282);
    expect(power.xpForLevel(3)).toBe(519);
    for (let level = 2; level < 12; level += 1) {
      expect(power.xpForLevel(level)).toBeGreaterThan(power.xpForLevel(level - 1));
    }
    expect(power.xpForLevel(12)).toBe(0);
  });

  test("lifetime totals are the sum of the thresholds below them", () => {
    expect(power.totalXpFor(1)).toBe(0);
    expect(power.totalXpFor(4)).toBe(power.xpForLevel(1) + power.xpForLevel(2) + power.xpForLevel(3));
    expect(power.table().length).toBe(12);
    expect(power.table()[0]).toEqual({ level: 1, xpForLevel: 100, totalXp: 0 });
    expect(power.table()[11]).toEqual({ level: 12, xpForLevel: 0, totalXp: power.totalXpFor(12) });
  });

  test("resolves a settled level, surplus and cap from one xp total", () => {
    const exact = power.levelForXp(power.totalXpFor(4));
    expect(exact.level).toBe(4);
    expect(exact.xp).toBe(0);
    expect(exact.xpMax).toBe(power.xpForLevel(4));
    expect(exact.levelsGained).toBe(3);

    const surplus = power.levelForXp(power.totalXpFor(4) + 50);
    expect(surplus.level).toBe(4);
    expect(surplus.xp).toBe(50);

    const capped = power.levelForXp(10_000_000);
    expect(capped.level).toBe(12);
    expect(capped.xp).toBe(0);
    expect(capped.levelsGained).toBe(11);
  });

  test("flat, linear, geometric and table rules each generate their stated shape", () => {
    const flat = defineXpCurve({ growth: "flat", step: 40, maxLevel: 5 });
    expect(flat.table().map((row) => row.xpForLevel)).toEqual([40, 40, 40, 40, 0]);

    const linear = defineXpCurve({ growth: "linear", step: 100, growthRate: 25, maxLevel: 4 });
    expect(linear.table().map((row) => row.xpForLevel)).toEqual([100, 125, 150, 0]);

    const geometric = defineXpCurve({ growth: "geometric", step: 100, growthRate: 1.2, maxLevel: 4, round: "round" });
    expect(geometric.table().map((row) => row.xpForLevel)).toEqual([100, 120, 144, 0]);

    const table = defineXpCurve({ growth: "table", step: 1, table: [30, 90, 210], maxLevel: 4 });
    expect(table.table().map((row) => row.xpForLevel)).toEqual([30, 90, 210, 0]);
    expect(table.totalXpFor(4)).toBe(330);
  });

  test("curve data is validated before it drives levels", () => {
    expect(() => assertXpCurve({ growth: "flat", step: 10, maxLevel: 1 })).toThrow(/maxLevel/);
    expect(() => assertXpCurve({ growth: "flat", step: 0, maxLevel: 5 })).toThrow(/step/);
    expect(() => assertXpCurve({ growth: "power", step: 10, growthRate: 0, maxLevel: 5 })).toThrow(/positive/);
    expect(() => assertXpCurve({ growth: "table", step: 1, table: [10], maxLevel: 5 })).toThrow(/thresholds/);
    expect(() => defineXpCurve({ growth: "geometric", step: 10, growthRate: -1, maxLevel: 5 })).toThrow(RangeError);
  });

  test("the same data drives a leveling track through a stat adapter", () => {
    const stats = adapter();
    const track = power.track();
    expect(track.xpForLevel(3)).toBe(power.xpForLevel(3));
    expect(track.maxLevel).toBe(12);

    const reached: number[] = [];
    const gained = track.grantXp(stats, "p1", power.totalXpFor(5) + 20, (level) => reached.push(level));
    expect(gained).toBe(4);
    expect(reached).toEqual([2, 3, 4, 5]);
    expect(stats.ready()).toEqual({ level: 5, xp: 20 });
  });

  test("resolving the same total twice costs the same and reads the same", () => {
    const first = defineXpCurve(power.def); // restore from saved data, not the builder's closure
    expect(first.table()).toEqual(power.table());
    expect(first.levelForXp(1234)).toEqual(power.levelForXp(1234));
    expect(first.rule).toBe(power.rule);
  });
});
