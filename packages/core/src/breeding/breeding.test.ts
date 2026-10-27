import { describe, expect, test } from "bun:test";

import { babyStage, createBreedingField, type BreedingSpecies, type MateCandidate } from "./breeding";
import { inheritStats, scatterLevels } from "./inheritance";

function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const RAPTOR: BreedingSpecies = { mode: "egg", carrySeconds: 7140, incubation: [20, 28], maturationSeconds: 133_320, mateSeconds: 60, mateRange: 4, cooldownSeconds: [64_800, 172_800] };
const PHIOMIA: BreedingSpecies = { mode: "gestation", carrySeconds: 35_700, incubation: null, maturationSeconds: 174_180, mateSeconds: 60, mateRange: 5, cooldownSeconds: [64_800, 172_800] };

const field = () =>
  createBreedingField<{ from: string }>({
    species: (id) => (id === "raptor" ? RAPTOR : id === "phiomia" ? PHIOMIA : null),
    conceive: (mother, father) => ({ from: `${mother}+${father}` }),
    careIntervalSeconds: 28_800,
    careKinds: ["cuddle", "walk"],
    eggHealthSeconds: 600,
    multiples: { twins: 0, triplets: 0 },
  });

const pair = (gap: number, species = "raptor"): MateCandidate[] => [
  { id: "her", species, sex: "female", at: [0, 0, 0] },
  { id: "him", species, sex: "male", at: [gap, 0, 0] },
];

describe("breeding", () => {
  test("a pair kept together for the mating time lays an egg; apart, the bar starts over; then she rests", () => {
    const breeding = field();
    const rng = rngOf(3);
    breeding.mate(pair(3), 0, 30, rng);
    expect(breeding.matingProgress("her")).toBeCloseTo(0.5, 6);
    // Walked apart: the bar is gone.
    breeding.mate(pair(10), 30, 1, rng);
    expect(breeding.matingProgress("her")).toBeNull();
    // A male of another kind, or a second female, does nothing.
    expect(breeding.mate([{ ...pair(3)[0]! }, { id: "x", species: "phiomia", sex: "male", at: [1, 0, 0] }], 31, 60, rng)).toEqual([]);
    breeding.mate(pair(3), 40, 30, rng);
    const events = breeding.mate(pair(3), 70, 30, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived", "laid"]);
    expect(breeding.eggs()).toHaveLength(1);
    expect(breeding.eggs()[0]!.baby).toEqual({ from: "her+him" });
    // ARK's 18 to 48 hours before she mates again.
    expect(breeding.cooldown("her", 70)).toBeGreaterThanOrEqual(64_800);
    expect(breeding.cooldown("her", 70)).toBeLessThanOrEqual(172_800);
    expect(breeding.mate(pair(3), 100, 120, rng)).toEqual([]);
  });

  test("an egg hatches only in its temperature, and out of it loses health until it is lost", () => {
    const breeding = field();
    const rng = rngOf(5);
    breeding.mate(pair(2), 0, 61, rng);
    const warm = () => 24;
    for (let t = 0; t < 3570; t += 10) expect(breeding.tick(t, 10, warm, rng)).toEqual([]);
    expect(breeding.eggs()[0]!.progress).toBeCloseTo(0.5, 2);
    // Too cold: no progress, health falls.
    breeding.tick(3570, 300, () => 10, rng);
    expect(breeding.eggs()[0]!.progress).toBeCloseTo(0.5, 2);
    expect(breeding.eggs()[0]!.health).toBeCloseTo(0.5, 6);
    let hatched = null as string | null;
    for (let t = 3870; t < 8000 && hatched === null; t += 10) hatched = breeding.tick(t, 10, warm, rng).find((event) => event.type === "hatched")?.type ?? null;
    expect(hatched).toBe("hatched");
    expect(breeding.eggs()).toHaveLength(0);
    // A second egg left in the snow is lost after its ten minutes.
    breeding.mate(pair(2), 200_000, 61, rng);
    const lost = breeding.tick(200_100, 600, () => -10, rng);
    expect(lost.map((event) => event.type)).toEqual(["eggLost"]);
  });

  test("a mammal carries for its gestation and gives birth, then rests", () => {
    const breeding = field();
    const rng = rngOf(7);
    const events = breeding.mate(pair(4, "phiomia"), 0, 61, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived"]);
    expect(breeding.eggs()).toHaveLength(0);
    expect(breeding.pregnancy("her")?.progress).toBe(0);
    expect(breeding.tick(35_000, 35_000, () => 0, rng)).toEqual([]);
    const born = breeding.tick(35_700, 700, () => 0, rng);
    expect(born).toEqual([{ type: "born", mother: "her", species: "phiomia", baby: { from: "her+him" } }]);
    expect(breeding.pregnancy("her")).toBeNull();
    expect(breeding.cooldown("her", 35_700)).toBeGreaterThan(0);
  });

  test("a baby grows through ARK's stages, asks for care every interval, and answering every request imprints it fully", () => {
    const breeding = field();
    const rng = rngOf(11);
    breeding.raise("baby", "raptor", 0);
    expect(babyStage(0.05)).toBe("baby");
    expect(babyStage(0.2)).toBe("juvenile");
    expect(babyStage(0.7)).toBe("adolescent");
    let asked = 0;
    let imprint = 0;
    let grown = null as number | null;
    for (let t = 0; t <= 140_000 && grown === null; t += 60) {
      for (const event of breeding.tick(t, 60, () => 0, rng)) {
        if (event.type === "wants") {
          asked += 1;
          // Wrong care does nothing; the asked one adds interval / maturation.
          expect(breeding.care("baby", event.care === "cuddle" ? "walk" : "cuddle")).toBe(0);
          imprint += breeding.care("baby", event.care);
        }
        if (event.type === "grown") grown = event.imprint;
      }
    }
    // 37 hours of growing, a request every 8: four asked, each 28800 / 133320 of the whole.
    expect(asked).toBe(4);
    expect(imprint).toBeCloseTo((4 * 28_800) / 133_320, 6);
    expect(grown).toBeCloseTo(imprint, 6);
    expect(breeding.baby("baby")).toBeNull();
  });

  test("faster server speeds shorten everything, and the save keeps eggs, pregnancies and babies", () => {
    const breeding = field();
    const rng = rngOf(13);
    breeding.setSpeeds({ hatch: 10, mature: 10, care: 10, mating: 10 });
    breeding.mate(pair(2), 0, 61, rng);
    expect(breeding.cooldown("her", 0)).toBeLessThanOrEqual(17_280);
    const hatched = breeding.tick(714, 714, () => 25, rng);
    expect(hatched.map((event) => event.type)).toEqual(["hatched"]);
    breeding.raise("baby", "raptor", 714);
    breeding.mate(pair(2, "phiomia").map((entry) => ({ ...entry, id: `${entry.id}2` })), 714, 61, rng);
    const copy = field();
    copy.restore(breeding.snapshot());
    expect(copy.baby("baby")?.nextCareAt).toBeCloseTo(714 + 2880, 6);
    expect(copy.pregnancy("her2")?.species).toBe("phiomia");
    expect(copy.speeds().mature).toBe(10);
    copy.forget("baby");
    expect(copy.babies()).toHaveLength(0);
    expect(() => breeding.raise("x", "titanoboa", 0)).toThrow("cannot breed");
  });

  test("twins and triplets come at their odds", () => {
    const breeding = createBreedingField({
      species: () => RAPTOR,
      conceive: () => 1,
      careIntervalSeconds: 1,
      careKinds: ["cuddle"],
      eggHealthSeconds: 1,
    });
    const rng = rngOf(17);
    const litters = [0, 0, 0];
    for (let n = 0; n < 4000; n += 1) {
      const conceived = breeding.mate(pair(2), n * 1e7, 61, rng).find((event) => event.type === "conceived");
      if (conceived?.type === "conceived") litters[conceived.count - 1]! += 1;
    }
    expect(litters[1]! / 4000).toBeGreaterThan(0.08);
    expect(litters[1]! / 4000).toBeLessThan(0.12);
    expect(litters[2]! / 4000).toBeGreaterThan(0.01);
    expect(litters[2]! / 4000).toBeLessThan(0.03);
  });
});

describe("inheritance", () => {
  test("each stat comes whole from one parent, the stronger 55% of the time", () => {
    const rng = rngOf(19);
    let higher = 0;
    const trials = 4000;
    for (let n = 0; n < trials; n += 1) {
      const { points, mutations } = inheritStats({ health: 10, melee: 2 }, { health: 4, melee: 9 }, rng);
      expect(mutations).toEqual([]);
      expect([10, 4]).toContain(points.health);
      expect([2, 9]).toContain(points.melee);
      if (points.health === 10) higher += 1;
    }
    expect(higher / trials).toBeGreaterThan(0.52);
    expect(higher / trials).toBeLessThan(0.58);
  });

  test("a mutation adds its levels to one stat, at its chance a roll", () => {
    const rng = rngOf(23);
    let mutated = 0;
    for (let n = 0; n < 4000; n += 1) {
      const { points, mutations } = inheritStats({ health: 5, melee: 5 }, { health: 5, melee: 5 }, rng, { mutations: { rolls: 3, chance: 0.025, levels: 2, stats: ["health", "melee"] } });
      expect(points.health + points.melee).toBe(10 + mutations.length * 2);
      mutated += mutations.length;
    }
    // Three rolls at 2.5%: about 0.075 a baby.
    expect(mutated / 4000).toBeGreaterThan(0.06);
    expect(mutated / 4000).toBeLessThan(0.09);
  });

  test("a creature's levels spread over its stats and add up", () => {
    const points = scatterLevels(29, ["health", "stamina", "weight"], rngOf(29));
    expect(points.health + points.stamina + points.weight).toBe(29);
    expect(Object.values(points).filter((value) => value > 0).length).toBeGreaterThan(1);
  });
});
