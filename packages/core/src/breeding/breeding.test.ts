import { describe, expect, test } from "bun:test";

import { inheritValues } from "../inheritance/inheritance";
import { tierAt, type ThresholdBoundary } from "../threshold/thresholds";
import { createBreedingField, type BreedingSpecies, type MateCandidate } from "./breeding";

function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const BUG: BreedingSpecies = { mode: "egg", mateSeconds: 10, mateRange: 4, carrySeconds: 100, incubation: [20, 30], eggHealthSeconds: 50, maturationSeconds: 1000, cooldownSeconds: [100, 200] };
const BEAST: BreedingSpecies = { mode: "carry", mateSeconds: 10, mateRange: 5, carrySeconds: 200, incubation: null, eggHealthSeconds: 50, maturationSeconds: 2000, cooldownSeconds: [100, 200] };

const field = () =>
  createBreedingField<{ from: string }>({
    species: (id) => (id === "bug" ? BUG : id === "beast" ? BEAST : null),
    conceive: (mother, father) => ({ from: `${mother}+${father}` }),
    careIntervalSeconds: 200,
    careKinds: ["cuddle", "walk"],
  });

const pair = (gap: number, species = "bug", who = "her", mate = "him"): MateCandidate[] => [
  { id: who, species, sex: "female", at: [0, 0, 0] },
  { id: mate, species, sex: "male", at: [gap, 0, 0] },
];

describe("breeding", () => {
  test("a pair kept together for the mating time lays an egg; apart, the bar starts over; then she rests", () => {
    const breeding = field();
    const rng = rngOf(3);
    breeding.mate(pair(3), 0, 5, rng);
    expect(breeding.matingProgress("her")).toBeCloseTo(0.5, 6);
    // Walked apart: the bar is gone.
    breeding.mate(pair(10), 5, 1, rng);
    expect(breeding.matingProgress("her")).toBeNull();
    expect(breeding.mate(pair(3), 6, 5, rng)).toEqual([]);
    // A male of another kind does nothing.
    expect(breeding.mate([{ id: "her", species: "bug", sex: "female", at: [0, 0, 0] }, { id: "x", species: "beast", sex: "male", at: [1, 0, 0] }], 11, 10, rng)).toEqual([]);
    expect(breeding.mate(pair(3), 12, 5, rng)).toEqual([]);
    const events = breeding.mate(pair(3), 17, 5, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived", "laid"]);
    expect(breeding.eggs()).toHaveLength(1);
    expect(breeding.eggs()[0]?.baby).toEqual({ from: "her+him" });
    expect(breeding.cooldown("her", 17)).toBeGreaterThanOrEqual(100);
    expect(breeding.cooldown("her", 17)).toBeLessThanOrEqual(200);
    expect(breeding.mate(pair(3), 20, 20, rng)).toEqual([]);
  });

  test("an egg hatches only inside its temperature band, and out of it loses health until it is lost", () => {
    const breeding = field();
    const rng = rngOf(5);
    breeding.mate(pair(2), 0, 10, rng);
    const warm = () => 24;
    breeding.tick(50, 50, warm, rng);
    expect(breeding.eggs()[0]?.progress).toBeCloseTo(0.5, 6);
    // Too cold: no progress, health falls.
    breeding.tick(75, 25, () => 10, rng);
    expect(breeding.eggs()[0]?.progress).toBeCloseTo(0.5, 6);
    expect(breeding.eggs()[0]?.health).toBeCloseTo(0.5, 6);
    const hatched = breeding.tick(125, 50, warm, rng);
    expect(hatched.map((event) => event.type)).toEqual(["hatched"]);
    expect(breeding.eggs()).toHaveLength(0);
    // A second egg left out of its band is lost after its health runs out.
    breeding.mate(pair(2), 1000, 10, rng);
    const lost = breeding.tick(1050, 50, () => -10, rng);
    expect(lost.map((event) => event.type)).toEqual(["eggLost"]);
  });

  test("a carrier grows her young for the carrying time and gives birth, then rests", () => {
    const breeding = field();
    const rng = rngOf(7);
    const events = breeding.mate(pair(4, "beast"), 0, 10, rng);
    expect(events.map((event) => event.type)).toEqual(["conceived"]);
    expect(breeding.eggs()).toHaveLength(0);
    expect(breeding.pregnancy("her")?.progress).toBe(0);
    expect(breeding.tick(100, 100, () => 0, rng)).toEqual([]);
    expect(breeding.pregnancy("her")?.progress).toBeCloseTo(0.5, 6);
    const born = breeding.tick(200, 100, () => 0, rng);
    expect(born).toEqual([{ type: "born", mother: "her", species: "beast", baby: { from: "her+him" } }]);
    expect(breeding.pregnancy("her")).toBeNull();
    expect(breeding.cooldown("her", 200)).toBeGreaterThan(0);
  });

  test("the young grow, ask for care every interval, and answering every request bonds them fully", () => {
    const breeding = field();
    const rng = rngOf(11);
    breeding.raise("kid", "bug", 0);
    let asked = 0;
    let bond = 0;
    let grown: number | null = null;
    for (let t = 0; t <= 1000 && grown === null; t += 10) {
      for (const event of breeding.tick(t, 10, () => 0, rng)) {
        if (event.type === "wants") {
          asked += 1;
          // Wrong care does nothing; the asked one adds a share of the whole bond.
          expect(breeding.care("kid", event.care === "cuddle" ? "walk" : "cuddle")).toBe(0);
          bond += breeding.care("kid", event.care);
        }
        if (event.type === "grown") grown = event.bond;
      }
    }
    // A thousand seconds of growing, a request every two hundred: four asked, each 200 / 1000 of the whole.
    expect(asked).toBe(4);
    expect(bond).toBeCloseTo(0.8, 6);
    expect(grown).toBeCloseTo(bond, 6);
    expect(breeding.baby("kid")).toBeNull();
  });

  test("faster paces shorten everything, and the save keeps eggs, pregnancies and the young", () => {
    const breeding = field();
    const rng = rngOf(13);
    breeding.setSpeeds({ carry: 10, grow: 10, bond: 10, pair: 10 });
    breeding.mate(pair(2), 0, 10, rng);
    expect(breeding.cooldown("her", 0)).toBeLessThanOrEqual(20);
    expect(breeding.tick(9, 9, () => 25, rng)).toEqual([]);
    expect(breeding.tick(10, 1, () => 25, rng).map((event) => event.type)).toEqual(["hatched"]);
    breeding.raise("kid", "bug", 10);
    breeding.mate(pair(2, "beast", "her2", "him2"), 10, 10, rng);
    const copy = field();
    copy.restore(breeding.snapshot());
    expect(copy.baby("kid")?.nextCareAt).toBeCloseTo(30, 6);
    expect(copy.pregnancy("her2")?.species).toBe("beast");
    expect(copy.speeds().grow).toBe(10);
    copy.forget("kid");
    expect(copy.babies()).toHaveLength(0);
    expect(() => breeding.raise("x", "worm", 0)).toThrow("cannot breed");
  });

  test("twins and triplets come at their odds", () => {
    const breeding = createBreedingField({
      species: () => BUG,
      conceive: () => 1,
      careIntervalSeconds: 1,
      careKinds: [],
      multiples: { twins: 0.25, triplets: 0.05 },
    });
    const rng = rngOf(17);
    const litters = [0, 0, 0];
    for (let n = 0; n < 4000; n += 1) {
      const conceived = breeding.mate(pair(2), n * 1e6, 10, rng).find((event) => event.type === "conceived");
      if (conceived?.type === "conceived") {
        const index = conceived.count - 1;
        litters[index] = (litters[index] ?? 0) + 1;
      }
    }
    expect((litters[1] ?? 0) / 4000).toBeGreaterThan(0.23);
    expect((litters[1] ?? 0) / 4000).toBeLessThan(0.27);
    expect((litters[2] ?? 0) / 4000).toBeGreaterThan(0.04);
    expect((litters[2] ?? 0) / 4000).toBeLessThan(0.06);
  });
});

describe("simple dog breeding", () => {
  test("two parents pass their values on, and a puppy becomes an adult by its age", () => {
    const sire = { size: 60, speed: 40, coat: 10 };
    const dam = { size: 50, speed: 55, coat: 10 };
    const puppy = inheritValues(sire, dam, rngOf(29), { defaultRule: { pick: "either", higherChance: 0.55 } });
    expect([sire.size, dam.size]).toContain(puppy.values.size);
    expect([sire.speed, dam.speed]).toContain(puppy.values.speed);
    expect(puppy.mutations).toEqual([]);
    // A two-step stage list is all the growing needs.
    const stages: ThresholdBoundary[] = [
      { id: "puppy", at: 0 },
      { id: "adult", at: 1 },
    ];
    const stageAt = (months: number) => tierAt(stages, months / 12)?.id ?? "";
    expect(stageAt(0)).toBe("puppy");
    expect(stageAt(11.9)).toBe("puppy");
    expect(stageAt(12)).toBe("adult");
  });
});
