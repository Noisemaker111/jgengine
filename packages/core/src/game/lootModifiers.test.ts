import { expect, test } from "bun:test";
import { createLootPipeline } from "./lootPipeline";
import { timeScaledRarity } from "./lootModifiers";

test("time-scaled weighted rarity preserves original weights and records effective policy provenance", () => {
  const table = { id: "authored", entries: [{ item: "common", count: 1, weight: 9 }, { item: "rare", count: 1, weight: 1 }] };
  const before = structuredClone(table);
  const pipeline = createLootPipeline({ id: "p", stages: [{ id: "s", table, modifiers: [timeScaledRarity({ id: "depth", ramp: (entry, hours) => entry.item === "rare" ? 1 + hours : 1 })] }] });
  const early = pipeline.resolve({ ctx: { elapsedMs: 0 }, rng: () => 0.5 });
  const late = pipeline.resolve({ ctx: { elapsedMs: 9 * 3_600_000 }, rng: () => 0.5 });
  expect(early.drops).toEqual([{ item: "common", count: 1 }]); expect(late.drops).toEqual([{ item: "rare", count: 1 }]);
  expect(late.provenance[0]).toMatchObject({ originalWeight: 1, effectiveWeight: 10, modifiers: ["depth"] });
  expect(late.stages[0]?.modifiers).toEqual(["depth"]); expect(table).toEqual(before);
});

test("independent odds use the same authored ramp, clamp chances and retain original provenance", () => {
  const pipeline = createLootPipeline({ id: "p", stages: [{ id: "s", table: { id: "independent", mode: "independent", entries: [{ item: "rare", count: 1, chance: 0.2 }] }, modifiers: [timeScaledRarity({ ramp: (_entry, hours) => 1 + hours })] }] });
  expect(pipeline.resolve({ ctx: { elapsedMs: 0 }, rng: () => 0.9 }).drops).toEqual([]);
  const late = pipeline.resolve({ ctx: { elapsedMs: 5 * 3_600_000 }, rng: () => 0.9 });
  expect(late.drops).toEqual([{ item: "rare", count: 1 }]); expect(late.provenance[0]).toMatchObject({ originalChance: 0.2, effectiveChance: 1, modifiers: ["time-scaled-rarity"] });
});

test("zero ramps gate rewards and invalid elapsed/curve values reject", () => {
  const make = (ramp: number) => createLootPipeline({ id: "p", stages: [{ id: "s", table: { id: "t", entries: [{ item: "ore", count: 1, weight: 1 }] }, modifiers: [timeScaledRarity({ ramp: () => ramp })] }] });
  expect(make(0).resolve({ ctx: { elapsedMs: 1 }, rng: () => 0 }).drops).toEqual([]);
  for (const value of [NaN, Infinity, -1]) {
    expect(() => make(value).resolve({ ctx: { elapsedMs: 1 }, rng: () => 0 })).toThrow();
    expect(() => make(1).resolve({ ctx: { elapsedMs: value }, rng: () => 0 })).toThrow();
  }
});
