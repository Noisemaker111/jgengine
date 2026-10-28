import { describe, expect, test } from "bun:test";

import {
  bakeGeneratorVariants,
  defineGenerator,
  generatorContext,
  generatorSeed,
  generatorVariants,
  getGenerator,
  listGenerators,
  registerGenerator,
  runGenerator,
  variantIndexAt,
} from "./generator";
import { defineParamSchema } from "./paramSchema";

const SCHEMA = defineParamSchema({
  fields: [
    { type: "range", key: "count", min: 1, max: 20, step: 1, default: 5 },
    { type: "range", key: "spread", min: 0, max: 4, default: 1 },
    { type: "range", key: "locked", min: 0, max: 4, default: 2, vary: false },
    { type: "seed", key: "seed", default: "" },
  ],
});

const POINTS = defineGenerator({
  id: "test-points",
  label: "Points",
  output: "points",
  schema: SCHEMA,
  lods: [1, 0.25],
  generate(params, context) {
    const random = context.random("points");
    const count = Math.max(1, Math.round(params.count * context.detail));
    return Array.from({ length: count }, () => [random() * params.spread, random() * params.spread] as const);
  },
});

describe("generator context", () => {
  test("named streams are deterministic and independent", () => {
    const a = generatorContext("s");
    const b = generatorContext("s");
    expect(a.random("x")()).toBe(b.random("x")());
    expect(a.random("x")()).not.toBe(a.random("y")());
  });

  test("detail is clamped to 0..1", () => {
    expect(generatorContext("s", 3).detail).toBe(1);
    expect(generatorContext("s", -1).detail).toBe(0);
  });
});

describe("runGenerator", () => {
  test("same meta and seed give the same output", () => {
    expect(runGenerator(POINTS, { count: 4, seed: "a" })).toEqual(runGenerator(POINTS, { count: 4, seed: "a" }));
    expect(runGenerator(POINTS, { count: 4, seed: "a" })).not.toEqual(runGenerator(POINTS, { count: 4, seed: "b" }));
  });

  test("params are parsed and clamped against the schema", () => {
    expect(runGenerator(POINTS, { count: 99, seed: "a" })).toHaveLength(20);
  });

  test("an empty seed falls back to the given fallback", () => {
    expect(generatorSeed(SCHEMA, { seed: "" }, "object-7")).toBe("object-7");
    expect(runGenerator(POINTS, {}, { fallbackSeed: "object-7" })).toEqual(runGenerator(POINTS, { seed: "object-7" }));
  });
});

describe("variants", () => {
  test("lays out a stable grid with the base first", () => {
    const grid = generatorVariants(POINTS, { count: 6, seed: "base" }, { count: 20, seed: "grid" });
    expect(grid).toHaveLength(20);
    expect(grid[0]?.seed).toBe("base");
    expect(grid[0]?.params.count).toBe(6);
    expect(new Set(grid.map((variant) => variant.seed)).size).toBe(20);
    expect(generatorVariants(POINTS, { count: 6, seed: "base" }, { count: 20, seed: "grid" })).toEqual(grid);
  });

  test("explore 0 varies only the seed; vary:false fields never move", () => {
    const still = generatorVariants(POINTS, { count: 6, seed: "base" }, { count: 8, explore: 0 });
    expect(still.every((variant) => variant.params.count === 6)).toBe(true);
    const wide = generatorVariants(POINTS, { count: 6, seed: "base" }, { count: 8, explore: 1 });
    expect(wide.some((variant) => variant.params.count !== 6)).toBe(true);
    expect(wide.every((variant) => variant.params.locked === 2)).toBe(true);
  });

  test("kept variants stay pinned at the front", () => {
    const keep = [{ count: 9, seed: "kept" }];
    const grid = generatorVariants(POINTS, { seed: "base" }, { count: 4, keep });
    expect(grid[0]?.meta).toEqual({ count: 9, seed: "kept" });
    expect(grid[1]?.seed).toBe("base");
  });

  test("bakes every variant at each detail level", () => {
    const baked = bakeGeneratorVariants(POINTS, { count: 8, seed: "b" }, { count: 3 });
    expect(baked).toHaveLength(3);
    expect(baked[0]?.lods.map((lod) => lod.detail)).toEqual([1, 0.25]);
    expect(baked[0]?.lods[0]?.output).toHaveLength(8);
    expect(baked[0]?.lods[1]?.output).toHaveLength(2);
  });

  test("variantIndexAt picks a stable index in range", () => {
    const picks = Array.from({ length: 50 }, (_, i) => variantIndexAt(5, "s", i));
    expect(picks.every((index) => index >= 0 && index < 5)).toBe(true);
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(variantIndexAt(5, "s", 3)).toBe(variantIndexAt(5, "s", 3));
    expect(variantIndexAt(1, "s", 3)).toBe(0);
  });
});

describe("registry", () => {
  test("registers, looks up and filters by output", () => {
    registerGenerator(POINTS);
    expect(getGenerator("test-points")?.label).toBe("Points");
    expect(listGenerators("points").map((definition) => definition.id)).toContain("test-points");
    expect(listGenerators("parts").map((definition) => definition.id)).not.toContain("test-points");
  });

  test("registered generators parse untyped params on the way in", () => {
    registerGenerator(POINTS);
    const output = getGenerator("test-points")?.generate({ count: 999 }, generatorContext("r"));
    expect(Array.isArray(output) ? output.length : 0).toBe(20);
  });
});
