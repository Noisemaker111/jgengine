import { describe, expect, test } from "bun:test";

import { createAffixRoller, seededRng, type ItemBaseDef, type RollerConfig } from "./affix";

const config: RollerConfig = {
  pools: [
    {
      id: "mods",
      affixes: [
        { id: "fire", stat: "fire", op: "add", roll: [10, 20], weight: 50, namePart: { position: "prefix", text: "Flaming" } },
        { id: "honed", stat: "damage", op: "mul", roll: [1.2, 1.6], weight: 50, namePart: { position: "suffix", text: "of Honing" } },
      ],
    },
  ],
  rarities: [
    { id: "common", weight: 70, affixCount: 1 },
    { id: "legendary", weight: 30, affixCount: 2, statScale: 2, namePart: "Legendary" },
  ],
};

const pistol: ItemBaseDef = { id: "pistol", name: "Pistol", baseStats: { damage: 100 }, pools: ["mods"] };

function queueRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("affix roller", () => {
  test("rolls affixes, computes add-then-mul stats, and composes a name", () => {
    const roller = createAffixRoller(config);
    const rolled = roller.roll(pistol, "legendary", queueRng([0, 0, 0, 0]));
    expect(rolled.affixes).toEqual([
      { id: "fire", stat: "fire", op: "add", value: 10 },
      { id: "honed", stat: "damage", op: "mul", value: 1.2 },
    ]);
    expect(rolled.stats).toEqual({ damage: 240, fire: 10 });
    expect(rolled.name).toBe("Legendary Flaming Pistol of Honing");
  });

  test("common tier rolls fewer affixes and no rarity name part", () => {
    const roller = createAffixRoller(config);
    const rolled = roller.roll(pistol, "common", queueRng([0, 0]));
    expect(rolled.rarity).toBe("common");
    expect(rolled.affixes).toHaveLength(1);
    expect(rolled.stats).toEqual({ damage: 100, fire: 10 });
    expect(rolled.name).toBe("Flaming Pistol");
  });

  test("draws are without replacement and clamped to the candidate pool", () => {
    const roller = createAffixRoller(config);
    const rolled = roller.roll(pistol, "legendary", queueRng([0.99, 0, 0, 0]));
    const ids = rolled.affixes.map((a) => a.id).sort();
    expect(ids).toEqual(["fire", "honed"]);
  });

  test("rollRarity is weighted toward the heavier tier", () => {
    const roller = createAffixRoller(config);
    const rng = seededRng("gun-seed");
    const counts = { common: 0, legendary: 0 };
    for (let i = 0; i < 2000; i++) counts[roller.rollRarity(rng).id as "common" | "legendary"] += 1;
    expect(counts.common).toBeGreaterThan(counts.legendary);
    expect(counts.legendary).toBeGreaterThan(400);
    expect(counts.legendary).toBeLessThan(800);
  });

  test("same seed is deterministic across whole rolls", () => {
    const roller = createAffixRoller(config);
    const a = roller.rollRandom(pistol, seededRng("run-42"));
    const b = roller.rollRandom(pistol, seededRng("run-42"));
    expect(a).toEqual(b);
  });

  test("rarity.pools filters which base pools are drawable", () => {
    const scoped: RollerConfig = {
      pools: config.pools,
      rarities: [{ id: "elite", weight: 1, affixCount: 2, pools: [] }],
    };
    const roller = createAffixRoller(scoped);
    const rolled = roller.roll(pistol, "elite", queueRng([0, 0, 0, 0]));
    expect(rolled.affixes).toHaveLength(0);
  });

  test("unknown rarity throws; empty rarity list throws at construction", () => {
    const roller = createAffixRoller(config);
    expect(() => roller.roll(pistol, "mythic", queueRng([0]))).toThrow();
    expect(() => createAffixRoller({ pools: [], rarities: [] })).toThrow();
  });
});
