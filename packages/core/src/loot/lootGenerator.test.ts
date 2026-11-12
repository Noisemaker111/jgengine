import { describe, expect, test } from "bun:test";

import { generatorVariants, runGenerator, untypedGenerator } from "../generator/generator";
import { generatorVariantText } from "../generator/generatorText";
import { seededRng } from "../random/rng";
import { rollLoot, validateLootItem, type LootCatalog } from "./lootGen";
import { defineLootGenerator, LOOT_ITEMS_OUTPUT, MAX_LOOT_ROLL, registerLootGeneratorText } from "./lootGenerator";

const catalog: LootCatalog = {
  bases: [
    { id: "blade", name: "Blade", baseStats: { power: 10 }, pools: ["edge"] },
    { id: "maul", name: "Maul", baseStats: { power: 18 }, pools: ["edge"], minLevel: 4, weight: 0.5 },
  ],
  parts: [],
  pools: [
    {
      id: "edge",
      affixes: [
        { id: "keen", stat: "power", roll: [2, 5], weight: 3, namePart: { position: "prefix", text: "Keen" } },
        { id: "heavy", stat: "power", op: "mul", roll: [1.1, 1.3], weight: 1, namePart: { position: "suffix", text: "of Weight" } },
      ],
    },
  ],
  rarities: [
    { id: "common", at: 0, weight: 70, affixCount: 0 },
    { id: "rare", at: 1, weight: 25, affixCount: 1, statScale: 1.2, namePart: "Fine" },
    { id: "mythic", at: 2, weight: 5, affixCount: 2, statScale: 1.5, namePart: "Mythic" },
  ],
  manufacturers: [
    { id: "ash", name: "Ash" },
    { id: "brook", name: "Brook", bases: ["blade"], bias: { power: 2 } },
  ],
  levelScale: [[1, 1], [10, 2]],
};

const LOOT = defineLootGenerator({ id: "test.loot", label: "Test loot", catalog, defaults: { count: 4 } });

describe("defineLootGenerator", () => {
  test("is a generator of the loot-items family with a seed field and the catalog's options", () => {
    expect(LOOT.output).toBe(LOOT_ITEMS_OUTPUT);
    expect(LOOT.catalog).toBe(catalog);
    const rarity = LOOT.schema.fields.find((field) => field.key === "rarity");
    expect(rarity?.type === "select" ? rarity.options.map((option) => option.value) : []).toEqual(["", "common", "rare", "mythic"]);
    expect(LOOT.schema.fields.some((field) => field.type === "seed")).toBe(true);
  });

  test("same params and seed roll the same items; a different seed moves them", () => {
    const one = runGenerator(LOOT, { seed: "deterministic", level: 6 });
    expect(one).toHaveLength(4);
    expect(runGenerator(LOOT, { seed: "deterministic", level: 6 })).toEqual(one);
    expect(runGenerator(LOOT, { seed: "other", level: 6 })).not.toEqual(one);
  });

  test("a roll is the catalog's own rollLoot on the seed's stream, and a shorter roll is a prefix", () => {
    const rng = seededRng("same-stream");
    const expected = Array.from({ length: 6 }, () => rollLoot(catalog, rng, { level: 3 }));
    expect(runGenerator(LOOT, { seed: "same-stream", level: 3, count: 6 })).toEqual(expected);
    expect(runGenerator(LOOT, { seed: "same-stream", level: 3, count: 2 })).toEqual(expected.slice(0, 2));
  });

  test("pins hold: rarity, maker and base", () => {
    for (const item of runGenerator(LOOT, { seed: "pins", level: 5, count: 20, rarity: "mythic", manufacturer: "ash", base: "maul" })) {
      expect([item.rarity, item.manufacturer, item.baseId]).toEqual(["mythic", "ash", "maul"]);
      expect(validateLootItem(item, catalog)).toEqual([]);
    }
  });

  test("rarity frequencies over 6,000 rolls match the catalog weights within 4 sigma", () => {
    const rolls = 6_000;
    const items = runGenerator(LOOT, { seed: "distribution", level: 8, count: MAX_LOOT_ROLL });
    for (let batch = 1; items.length < rolls; batch += 1) items.push(...runGenerator(LOOT, { seed: `distribution-${batch}`, level: 8, count: MAX_LOOT_ROLL }));
    const sample = items.slice(0, rolls);
    const total = catalog.rarities.reduce((sum, tier) => sum + tier.weight, 0);
    for (const tier of catalog.rarities) {
      const target = tier.weight / total;
      const measured = sample.filter((item) => item.rarity === tier.id).length / rolls;
      expect(Math.abs(measured - target)).toBeLessThanOrEqual(4 * Math.sqrt((target * (1 - target)) / rolls));
    }
  });

  test("count and level read from params, and level gates bases", () => {
    const low = runGenerator(LOOT, { seed: "gate", level: 1, count: 40 });
    expect(low.every((item) => item.baseId === "blade" && item.level === 1)).toBe(true);
    expect(runGenerator(LOOT, { seed: "gate", level: 9, count: 200 }).some((item) => item.baseId === "maul")).toBe(true);
  });

  test("a bad catalog fails at declaration", () => {
    expect(() => defineLootGenerator({ id: "test.bad", label: "Bad", catalog: { ...catalog, rarities: [] } })).toThrow(/rarities/);
  });

  test("twenty variants read as twenty distinct loot sets of text", () => {
    registerLootGeneratorText();
    const definition = untypedGenerator(LOOT);
    const variants = generatorVariants(definition, { seed: "grid", level: 5 }, { count: 20 });
    const sets = variants.map((variant) => generatorVariantText(definition, variant) ?? []);
    expect(sets[0]).toEqual(runGenerator(LOOT, { seed: "grid", level: 5 }).map((item) => `${item.name} · ${item.rarity} · L${item.level}`));
    expect(sets.every((set) => set.length === 4)).toBe(true);
    expect(new Set(sets.map((set) => set.join("|"))).size).toBe(20);
  });

  test("params a catalog cannot roll read as one no-output line", () => {
    registerLootGeneratorText();
    const definition = untypedGenerator(LOOT);
    const [variant] = generatorVariants(definition, { seed: "bad", level: 1, base: "maul" }, { count: 1 });
    expect(generatorVariantText(definition, variant!)).toEqual([expect.stringMatching(/^no output: .*item level 4/)]);
  });
});
