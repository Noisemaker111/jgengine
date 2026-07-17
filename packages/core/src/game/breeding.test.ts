import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import {
  applyImprintBonus,
  breedOffspring,
  imprintIncrementPerRequest,
  incubationViable,
  maturationStage,
  tickIncubation,
  type Genome,
} from "./breeding";

/** Scripted rng that replays a fixed value sequence (cycling) for exact-branch tests. */
function scriptRng(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function genome(stats: Genome["stats"], mutationCount = 0, colorMutationCount = 0): Genome {
  return { stats, mutationCount, colorMutationCount };
}

describe("breedOffspring — inheritance", () => {
  test("takes the higher parent stat when the roll is under the chance", () => {
    const a = genome({ hp: 100 });
    const b = genome({ hp: 50 });
    const result = breedOffspring(a, b, scriptRng([0.1]), { mutationRolls: 0 });
    expect(result.genome.stats.hp).toBe(100);
  });

  test("takes the lower parent stat when the roll is at/above the chance", () => {
    const a = genome({ hp: 100 });
    const b = genome({ hp: 50 });
    const result = breedOffspring(a, b, scriptRng([0.9]), { mutationRolls: 0 });
    expect(result.genome.stats.hp).toBe(50);
  });

  test("each stat is inherited independently", () => {
    const a = genome({ hp: 100, stam: 10 });
    const b = genome({ hp: 50, stam: 80 });
    // stats sorted → hp then stam. Roll high for hp, low for stam.
    const result = breedOffspring(a, b, scriptRng([0.1, 0.9]), { mutationRolls: 0 });
    expect(result.genome.stats.hp).toBe(100); // high for hp
    expect(result.genome.stats.stam).toBe(10); // low for stam — independent of hp
  });

  test("a stat present on only one parent carries through", () => {
    const a = genome({ hp: 100, weight: 30 });
    const b = genome({ hp: 50 });
    const result = breedOffspring(a, b, scriptRng([0.9, 0.9]), { mutationRolls: 0 });
    expect(result.genome.stats.hp).toBe(50);
    expect(result.genome.stats.weight).toBe(30);
  });

  test("deterministic: same parents, config and rng seed → identical offspring", () => {
    const a = genome({ hp: 100, stam: 40, weight: 20 }, 3, 1);
    const b = genome({ hp: 60, stam: 90, weight: 55 }, 5, 2);
    const first = breedOffspring(a, b, seededRng("clutch-1"));
    const second = breedOffspring(a, b, seededRng("clutch-1"));
    expect(second).toEqual(first);
  });

  test("0.55 default bias favours the higher parent ~55% per stat", () => {
    const a = genome({ hp: 1 }); // high = 1
    const b = genome({ hp: 0 }); // low = 0
    const rng = seededRng("bias");
    const n = 4000;
    let highs = 0;
    for (let i = 0; i < n; i++) {
      if (breedOffspring(a, b, rng, { mutationRolls: 0 }).genome.stats.hp === 1) highs += 1;
    }
    expect(highs / n).toBeGreaterThan(0.52);
    expect(highs / n).toBeLessThan(0.58);
  });
});

describe("breedOffspring — mutations", () => {
  test("a successful roll adds the delta, bumps the counter, and reports the event", () => {
    const a = genome({ hp: 100 });
    const b = genome({ hp: 100 });
    // [inherit, success<1, pick index0, color roll<0.5 → color]
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.1]), {
      mutationRolls: 1,
      mutationChance: 1,
      mutationDelta: 2,
      colorMutationChance: 0.5,
    });
    expect(result.genome.stats.hp).toBe(102);
    expect(result.genome.mutationCount).toBe(1);
    expect(result.genome.colorMutationCount).toBe(1);
    expect(result.mutations).toEqual([{ stat: "hp", delta: 2, color: true }]);
  });

  test("non-color mutation leaves the color counter alone", () => {
    const a = genome({ hp: 100 });
    const b = genome({ hp: 100 });
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.9]), {
      mutationRolls: 1,
      mutationChance: 1,
      colorMutationChance: 0.5,
    });
    expect(result.genome.colorMutationCount).toBe(0);
    expect(result.mutations[0]!.color).toBe(false);
  });

  test("counters inherit as the max of the two parents plus new mutations", () => {
    const a = genome({ hp: 100 }, 4, 2);
    const b = genome({ hp: 100 }, 7, 1);
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.1]), {
      mutationRolls: 1,
      mutationChance: 1,
    });
    expect(result.genome.mutationCount).toBe(8); // max(4,7)+1
    expect(result.genome.colorMutationCount).toBe(3); // max(2,1)+1
  });

  test("soft cap blocks mutations when both parents exceed the threshold (default)", () => {
    const a = genome({ hp: 100 }, 25);
    const b = genome({ hp: 100 }, 25);
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.0]), {
      mutationRolls: 3,
      mutationChance: 1, // would always mutate if not capped
    });
    expect(result.mutations).toHaveLength(0);
    expect(result.genome.mutationCount).toBe(25);
  });

  test("default 'both' scope still mutates when only one parent is over the cap", () => {
    const a = genome({ hp: 100 }, 25);
    const b = genome({ hp: 100 }, 5);
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.9]), {
      mutationRolls: 1,
      mutationChance: 1,
    });
    expect(result.mutations).toHaveLength(1);
  });

  test("'either' scope blocks when a single parent is over the cap", () => {
    const a = genome({ hp: 100 }, 25);
    const b = genome({ hp: 100 }, 5);
    const result = breedOffspring(a, b, scriptRng([0.9, 0.0, 0.0, 0.9]), {
      mutationRolls: 1,
      mutationChance: 1,
      mutationSoftCap: { scope: "either" },
    });
    expect(result.mutations).toHaveLength(0);
  });

  test("'reduce' mode scales the chance instead of zeroing it", () => {
    const a = genome({ hp: 100 }, 25);
    const b = genome({ hp: 100 }, 25);
    const cfg = {
      mutationRolls: 1,
      mutationChance: 1,
      mutationSoftCap: { mode: "reduce" as const, reducedFactor: 0.5 },
    };
    // reduced chance = 0.5: success draw 0.4 < 0.5 mutates, 0.6 does not.
    expect(breedOffspring(a, b, scriptRng([0.9, 0.4, 0.0, 0.9]), cfg).mutations).toHaveLength(1);
    expect(breedOffspring(a, b, scriptRng([0.9, 0.6, 0.0, 0.9]), cfg).mutations).toHaveLength(0);
  });
});

describe("imprint", () => {
  test("increment is 1 / requestCount and 0 for non-positive counts", () => {
    expect(imprintIncrementPerRequest(10)).toBeCloseTo(0.1);
    expect(imprintIncrementPerRequest(4)).toBeCloseTo(0.25);
    expect(imprintIncrementPerRequest(0)).toBe(0);
    expect(imprintIncrementPerRequest(-5)).toBe(0);
  });

  test("full imprint applies +20% to everyone", () => {
    const boosted = applyImprintBonus({ hp: 100, dmg: 50 }, 1);
    expect(boosted.hp).toBeCloseTo(120);
    expect(boosted.dmg).toBeCloseTo(60);
  });

  test("owner also gets the +30% handler bonus at full imprint", () => {
    const boosted = applyImprintBonus({ hp: 100 }, 1, {}, { asOwner: true });
    expect(boosted.hp).toBeCloseTo(156); // 100 * 1.2 * 1.3
  });

  test("bonuses scale linearly below full imprint", () => {
    expect(applyImprintBonus({ hp: 100 }, 0.5).hp).toBeCloseTo(110); // 1 + 0.2*0.5
    expect(applyImprintBonus({ hp: 100 }, 0.5, {}, { asOwner: true }).hp).toBeCloseTo(126.5); // *1.15
  });

  test("imprint fraction is clamped to [0,1]", () => {
    expect(applyImprintBonus({ hp: 100 }, 2).hp).toBeCloseTo(120);
    expect(applyImprintBonus({ hp: 100 }, -1).hp).toBeCloseTo(100);
  });

  test("does not mutate the input stat block", () => {
    const stats = { hp: 100 };
    applyImprintBonus(stats, 1);
    expect(stats.hp).toBe(100);
  });
});

describe("incubation", () => {
  const cfg = { minTemp: 20, maxTemp: 30, healthLossPerTick: 2 };

  test("progresses and keeps health while in range", () => {
    const next = tickIncubation({ health: 100, elapsed: 0 }, 25, 5, cfg);
    expect(next).toEqual({ health: 100, elapsed: 5 });
  });

  test("loses health and stalls progress while too cold", () => {
    const next = tickIncubation({ health: 100, elapsed: 10 }, 5, 3, cfg);
    expect(next).toEqual({ health: 94, elapsed: 10 });
  });

  test("loses health while too hot", () => {
    const next = tickIncubation({ health: 10, elapsed: 0 }, 40, 3, cfg);
    expect(next.health).toBe(4);
  });

  test("health clamps at zero and viability flips", () => {
    const next = tickIncubation({ health: 3, elapsed: 0 }, 0, 5, cfg);
    expect(next.health).toBe(0);
    expect(incubationViable(next)).toBe(false);
    expect(incubationViable({ health: 1, elapsed: 0 })).toBe(true);
  });

  test("boundary temperatures are viable (inclusive range)", () => {
    expect(tickIncubation({ health: 100, elapsed: 0 }, 20, 1, cfg).elapsed).toBe(1);
    expect(tickIncubation({ health: 100, elapsed: 0 }, 30, 1, cfg).elapsed).toBe(1);
  });

  test("non-positive dt returns an unchanged copy", () => {
    const state = { health: 50, elapsed: 5 };
    const next = tickIncubation(state, 0, 0, cfg);
    expect(next).toEqual(state);
    expect(next).not.toBe(state);
  });
});

describe("maturationStage", () => {
  const stages = [
    { id: "adult", at: 1 },
    { id: "baby", at: 0 },
    { id: "adolescent", at: 0.5 },
    { id: "juvenile", at: 0.1 },
  ]; // deliberately unsorted

  test("resolves the last stage whose threshold is reached (inclusive)", () => {
    expect(maturationStage(0, 100, stages)).toBe("baby");
    expect(maturationStage(5, 100, stages)).toBe("baby");
    expect(maturationStage(10, 100, stages)).toBe("juvenile"); // 0.1 boundary inclusive
    expect(maturationStage(49, 100, stages)).toBe("juvenile");
    expect(maturationStage(50, 100, stages)).toBe("adolescent");
    expect(maturationStage(99, 100, stages)).toBe("adolescent");
    expect(maturationStage(100, 100, stages)).toBe("adult");
  });

  test("clamps past full duration to the final stage", () => {
    expect(maturationStage(500, 100, stages)).toBe("adult");
  });

  test("returns empty string with no stages", () => {
    expect(maturationStage(50, 100, [])).toBe("");
  });
});

describe("serialization", () => {
  test("an offspring genome round-trips through JSON unchanged", () => {
    const a = genome({ hp: 100, stam: 40, weight: 20 }, 3, 1);
    const b = genome({ hp: 60, stam: 90, weight: 55 }, 5, 2);
    const { genome: child } = breedOffspring(a, b, seededRng("save-load"));
    const roundTripped = JSON.parse(JSON.stringify(child));
    expect(roundTripped).toEqual(child);
  });
});
