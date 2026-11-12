import { describe, expect, test } from "bun:test";

import { generatorVariants, runGenerator, untypedGenerator } from "../generator/generator";
import { generatorVariantText } from "../generator/generatorText";
import { defineParamSchema } from "../generator/paramSchema";
import { seededRng } from "../random/rng";
import { defineItemGenerator, registerItemGeneratorText, rollItemRecipe, ROLLED_ITEM_OUTPUT, type ItemRecipe } from "./itemGenerator";

const SCHEMA = defineParamSchema({
  fields: [
    { type: "range", key: "luck", min: 0, max: 5, default: 1 },
    { type: "select", key: "tier", options: [{ value: "" }, { value: "plain" }, { value: "fine" }, { value: "grand" }], default: "", vary: false },
    { type: "seed", key: "seed", default: "" },
  ],
});

const TIERS = [
  { id: "plain", value: 1, weight: 6 },
  { id: "fine", value: 2, weight: 3 },
  { id: "grand", value: 4, weight: 1 },
];

/** A charm: a weighted tier (luck lifts the rarer ones), a uniform shape that grand tiers restrict, and a rolled shine. */
const CHARM: ItemRecipe<typeof SCHEMA, { name: string; tier: string; shine: number }> = {
  id: "test.charm",
  label: "Charm",
  schema: SCHEMA,
  steps: (params) => ({
    steps: [
      { id: "tier", pool: TIERS, weightOf: (option) => (option.weight ?? 1) * (option.id === "plain" ? 1 : params.luck) },
      {
        id: "shape",
        select: "uniform",
        pool: [
          { id: "ring", value: "Ring" },
          { id: "knot", value: "Knot" },
          { id: "star", value: "Star" },
        ],
        accept: (option, choices) => choices.optionId("tier") !== "grand" || option.id === "star",
      },
    ],
  }),
  pin: (params) => (params.tier === "" ? {} : { tier: params.tier }),
  build: (result, _params, rng) => ({
    name: `${result.choices["tier"]} ${String(result.values["shape"])}`,
    tier: result.choices["tier"]!,
    shine: Math.round(rng() * 100),
  }),
  describe: (item) => [item.name, `shine ${item.shine}`],
};

const CHARMS = defineItemGenerator(CHARM);

describe("item recipes on the generator contract", () => {
  test("the generator is the recipe rolled on the seed's stream", () => {
    expect(CHARMS.output).toBe(ROLLED_ITEM_OUTPUT);
    const seeded = runGenerator(CHARMS, { seed: "c1" });
    expect(seeded).toEqual(rollItemRecipe(CHARM, { luck: 1, tier: "", seed: "c1" }, seededRng("c1")));
    expect(runGenerator(CHARMS, { seed: "c1" })).toEqual(seeded);
    expect(seeded.summary).toEqual([seeded.item.name, `shine ${seeded.item.shine}`]);
    expect(seeded.provenance.choices.map((choice) => choice.step)).toEqual(["tier", "shape"]);
  });

  test("different seeds give different charms", () => {
    const rolls = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(runGenerator(CHARMS, { seed: `vary-${i}` }).item)));
    expect(rolls.size).toBeGreaterThan(15);
  });

  test("pins and constraints hold", () => {
    for (let i = 0; i < 30; i += 1) {
      const { item } = runGenerator(CHARMS, { seed: `grand-${i}`, tier: "grand" });
      expect(item.name).toBe("grand Star");
    }
  });

  test("tier frequencies follow the weights within 4 sigma, and luck lifts the rare tiers", () => {
    const rolls = 4_000;
    const rng = seededRng("tiers");
    const counts = new Map<string, number>();
    for (let i = 0; i < rolls; i += 1) {
      const { item } = rollItemRecipe(CHARM, { luck: 1, tier: "", seed: "" }, rng);
      counts.set(item.tier, (counts.get(item.tier) ?? 0) + 1);
    }
    for (const tier of TIERS) {
      const target = tier.weight / 10;
      const measured = (counts.get(tier.id) ?? 0) / rolls;
      expect(Math.abs(measured - target)).toBeLessThanOrEqual(4 * Math.sqrt((target * (1 - target)) / rolls));
    }
    const lucky = Array.from({ length: 400 }, (_, i) => runGenerator(CHARMS, { seed: `lucky-${i}`, luck: 5 }).item.tier);
    expect(lucky.filter((tier) => tier === "grand").length / 400).toBeGreaterThan(0.2);
  });

  test("an unsatisfiable pin throws naming the recipe", () => {
    const stuck: ItemRecipe<typeof SCHEMA, string> = { ...CHARM, id: "test.stuck", pin: () => ({ tier: "missing" }), build: () => "", describe: undefined };
    expect(() => rollItemRecipe(stuck, { luck: 1, tier: "", seed: "" }, seededRng("x"))).toThrow(/test\.stuck.*unsatisfiable/);
  });

  test("variants read as text from the item's summary", () => {
    registerItemGeneratorText();
    const definition = untypedGenerator(CHARMS);
    const variants = generatorVariants(definition, { seed: "grid" }, { count: 8 });
    const lines = variants.map((variant) => generatorVariantText(definition, variant));
    expect(lines[0]).toEqual(runGenerator(CHARMS, { seed: "grid" }).summary);
    expect(lines.every((set) => set?.length === 2)).toBe(true);
  });
});
