import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import {
  applyCaptureEffectiveness,
  captureBonusLevels,
  resolveSpawnStats,
  restoreSpawnInstance,
  rollSpawnInstance,
  snapshotSpawnInstance,
  spendDomesticLevel,
  type SpawnSpeciesDef,
} from "./spawnLevelStats";

type Stat = "health" | "stamina" | "melee" | "weight";

const species: SpawnSpeciesDef<Stat> = {
  health: { base: 100, growth: 0.1 },
  stamina: { base: 50, growth: 0.05 },
  melee: { base: 10, growth: 0.2 },
  weight: { base: 200, growth: 0.02 },
};

function totalPoints(points: Record<Stat, number>): number {
  return Object.values(points).reduce((sum, n) => sum + n, 0);
}

describe("rollSpawnInstance", () => {
  test("same rng seed produces the same distribution", () => {
    const a = rollSpawnInstance("raptor", species, 30, seededRng("seed-1"));
    const b = rollSpawnInstance("raptor", species, 30, seededRng("seed-1"));
    expect(b.points).toEqual(a.points);
  });

  test("different seeds diverge", () => {
    const a = rollSpawnInstance("raptor", species, 60, seededRng("seed-1"));
    const b = rollSpawnInstance("raptor", species, 60, seededRng("seed-2"));
    expect(b.points).not.toEqual(a.points);
  });

  test("distributed points total level - 1", () => {
    const inst = rollSpawnInstance("raptor", species, 45, seededRng("x"));
    expect(totalPoints(inst.points)).toBe(44);
    expect(inst.level).toBe(45);
    expect(inst.domesticLevels).toBe(0);
  });

  test("level 1 distributes no points", () => {
    const inst = rollSpawnInstance("raptor", species, 1, seededRng("x"));
    expect(totalPoints(inst.points)).toBe(0);
  });

  test("levels below 1 clamp to 1", () => {
    const inst = rollSpawnInstance("raptor", species, 0, seededRng("x"));
    expect(inst.level).toBe(1);
    expect(totalPoints(inst.points)).toBe(0);
  });
});

describe("resolveSpawnStats", () => {
  test("value = base * (1 + points * growth)", () => {
    const inst = {
      speciesId: "raptor",
      level: 5,
      domesticLevels: 0,
      points: { health: 3, stamina: 0, melee: 1, weight: 0 } as Record<Stat, number>,
    };
    const values = resolveSpawnStats(species, inst);
    expect(values.health).toBeCloseTo(130); // 100 * (1 + 3 * 0.1)
    expect(values.stamina).toBeCloseTo(50); // base, no points
    expect(values.melee).toBeCloseTo(12); // 10 * (1 + 1 * 0.2)
    expect(values.weight).toBeCloseTo(200);
  });
});

describe("captureBonusLevels", () => {
  test("0% effectiveness grants none", () => {
    expect(captureBonusLevels(20, 0)).toBe(0);
  });

  test("50% effectiveness grants floor(level * 0.5 / 2)", () => {
    expect(captureBonusLevels(20, 0.5)).toBe(5);
  });

  test("100% effectiveness grants floor(level / 2)", () => {
    expect(captureBonusLevels(20, 1)).toBe(10);
    expect(captureBonusLevels(21, 1)).toBe(10);
  });

  test("effectiveness clamps outside [0,1]", () => {
    expect(captureBonusLevels(20, 2)).toBe(10);
    expect(captureBonusLevels(20, -1)).toBe(0);
  });
});

describe("applyCaptureEffectiveness", () => {
  test("adds bonus points and reports tamed level", () => {
    const wild = rollSpawnInstance("raptor", species, 30, seededRng("wild"));
    const result = applyCaptureEffectiveness(species, wild, 1, seededRng("tame"));
    expect(result.bonusLevels).toBe(15); // floor(30 / 2)
    expect(result.tamedLevel).toBe(45);
    expect(result.instance.level).toBe(45);
    // total points = (level - 1) + bonus levels
    expect(totalPoints(result.instance.points)).toBe(29 + 15);
    expect(totalPoints(result.instance.points)).toBe(result.tamedLevel - 1);
  });

  test("does not mutate the wild instance", () => {
    const wild = rollSpawnInstance("raptor", species, 30, seededRng("wild"));
    const before = totalPoints(wild.points);
    applyCaptureEffectiveness(species, wild, 1, seededRng("tame"));
    expect(totalPoints(wild.points)).toBe(before);
    expect(wild.level).toBe(30);
  });

  test("zero effectiveness leaves stats unchanged", () => {
    const wild = rollSpawnInstance("raptor", species, 30, seededRng("wild"));
    const result = applyCaptureEffectiveness(species, wild, 0, seededRng("tame"));
    expect(result.bonusLevels).toBe(0);
    expect(result.tamedLevel).toBe(30);
    expect(result.instance.points).toEqual(wild.points);
  });
});

describe("spendDomesticLevel", () => {
  test("adds one growth increment and raises levels", () => {
    const inst = rollSpawnInstance("raptor", species, 10, seededRng("d"));
    const beforeHealth = inst.points.health;
    const result = spendDomesticLevel(inst, "health");
    expect(result.spent).toBe(true);
    expect(result.instance.points.health).toBe(beforeHealth + 1);
    expect(result.instance.level).toBe(11);
    expect(result.instance.domesticLevels).toBe(1);
    // input untouched
    expect(inst.points.health).toBe(beforeHealth);
  });

  test("respects the domestic-level cap", () => {
    let inst = rollSpawnInstance("raptor", species, 5, seededRng("d"));
    for (let i = 0; i < 3; i++) {
      const r = spendDomesticLevel(inst, "melee", { maxDomesticLevels: 3 });
      expect(r.spent).toBe(true);
      inst = r.instance;
    }
    expect(inst.domesticLevels).toBe(3);
    const capped = spendDomesticLevel(inst, "melee", { maxDomesticLevels: 3 });
    expect(capped.spent).toBe(false);
    expect(capped.instance).toBe(inst); // returned untouched
  });

  test("resolved value reflects the spent point", () => {
    const inst = rollSpawnInstance("raptor", species, 1, seededRng("d"));
    const leveled = spendDomesticLevel(inst, "melee").instance;
    expect(resolveSpawnStats(species, leveled).melee).toBeCloseTo(12); // 10 * (1 + 0.2)
  });
});

describe("snapshot round-trip", () => {
  test("survives JSON serialization unchanged", () => {
    const inst = applyCaptureEffectiveness(
      species,
      rollSpawnInstance("raptor", species, 40, seededRng("wild")),
      0.75,
      seededRng("tame"),
    ).instance;

    const snapshot = snapshotSpawnInstance(inst);
    const restored = restoreSpawnInstance<Stat>(JSON.parse(JSON.stringify(snapshot)));

    expect(restored).toEqual(inst);
    expect(resolveSpawnStats(species, restored)).toEqual(resolveSpawnStats(species, inst));
  });

  test("snapshot is a detached copy", () => {
    const inst = rollSpawnInstance("raptor", species, 20, seededRng("wild"));
    const snapshot = snapshotSpawnInstance(inst);
    snapshot.points.health += 100;
    expect(inst.points.health).not.toBe(snapshot.points.health);
  });
});
