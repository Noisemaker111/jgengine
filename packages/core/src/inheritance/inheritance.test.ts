import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { inheritValues, scatterPoints, type InheritOptions } from "./inheritance";

type Fields = "health" | "stamina" | "weight";

function rngOf(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

describe("inheritValues", () => {
  test("each field comes whole from one parent, the stronger 55% of the time", () => {
    const rng = rngOf(19);
    let higher = 0;
    const trials = 4000;
    for (let n = 0; n < trials; n += 1) {
      const { values, mutations } = inheritValues({ health: 10, melee: 2 }, { health: 4, melee: 9 }, rng, { defaultRule: { pick: "either", higherChance: 0.55 } });
      expect(mutations).toEqual([]);
      expect([10, 4]).toContain(values.health);
      expect([2, 9]).toContain(values.melee);
      if (values.health === 10) higher += 1;
    }
    expect(higher / trials).toBeGreaterThan(0.52);
    expect(higher / trials).toBeLessThan(0.58);
  });

  test("with no rule the higher parent wins half the time", () => {
    const rng = rngOf(31);
    let higher = 0;
    const trials = 4000;
    for (let n = 0; n < trials; n += 1) {
      const { values } = inheritValues({ height: 20 }, { height: 5 }, rng);
      if (values.height === 20) higher += 1;
    }
    expect(higher / trials).toBeGreaterThan(0.47);
    expect(higher / trials).toBeLessThan(0.53);
  });

  test("a mutation adds its amount to one field, at its chance a roll", () => {
    const rng = rngOf(23);
    let mutated = 0;
    for (let n = 0; n < 4000; n += 1) {
      const { values, mutations } = inheritValues({ health: 5, melee: 5 }, { health: 5, melee: 5 }, rng, { mutation: { rolls: 3, chance: 0.025, amount: 2, fields: ["health", "melee"] } });
      expect(values.health + values.melee).toBe(10 + mutations.length * 2);
      mutated += mutations.length;
    }
    // Three rolls at 2.5%: about 0.075 a child.
    expect(mutated / 4000).toBeGreaterThan(0.06);
    expect(mutated / 4000).toBeLessThan(0.09);
  });

  test("a blend weighs the parents and spreads the result by a random offset", () => {
    const a = { height: 10, speed: 4 };
    const b = { height: 2, speed: 8 };
    const exact = inheritValues(a, b, seededRng("blend"), { defaultRule: { pick: "blend", weight: 0.25 } });
    expect(exact.values).toEqual({ height: 4, speed: 7 });

    const spread = seededRng("blend-spread");
    const limit = 1.5;
    let offset = 0;
    for (let n = 0; n < 500; n += 1) {
      const { values } = inheritValues(a, b, spread, { defaultRule: { pick: "blend", weight: 0.25, spread: limit } });
      expect(Math.abs(values.height - 4)).toBeLessThanOrEqual(limit);
      expect(Math.abs(values.speed - 7)).toBeLessThanOrEqual(limit);
      offset += Math.abs(values.height - 4);
    }
    expect(offset / 500).toBeGreaterThan(0.1);
  });

  test("a field's own rule wins over the default", () => {
    const rng = seededRng("per-field");
    for (let n = 0; n < 50; n += 1) {
      const { values } = inheritValues({ health: 10, melee: 2 }, { health: 4, melee: 9 }, rng, {
        defaultRule: { pick: "either" },
        rules: { health: { pick: "blend", weight: 0 } },
      });
      expect(values.health).toBe(4);
      expect([2, 9]).toContain(values.melee);
    }
  });

  test("the same seed gives the same child as before the move", () => {
    const a = { health: 10, stamina: 4, weight: 7 };
    const b = { health: 6, stamina: 9, weight: 7 };
    const options: InheritOptions<Fields> = { defaultRule: { pick: "either", higherChance: 0.55 }, mutation: { rolls: 4, chance: 0.5, amount: 2, fields: ["health", "stamina", "weight"] } };
    const first = inheritValues(a, b, seededRng("inheritance-parity"), options);
    expect(first.values).toEqual({ health: 10, stamina: 6, weight: 11 });
    expect(first.mutations).toEqual(["weight", "stamina", "weight"]);
    expect(inheritValues(a, b, seededRng("inheritance-parity"), options)).toEqual(first);
  });
});

describe("scatterPoints", () => {
  test("points spread over fields and add up", () => {
    const values = scatterPoints(29, ["health", "stamina", "weight"], rngOf(29));
    expect(values.health + values.stamina + values.weight).toBe(29);
    expect(Object.values(values).filter((value) => value > 0).length).toBeGreaterThan(1);
  });
});
