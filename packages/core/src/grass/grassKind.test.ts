import { describe, expect, test } from "bun:test";

import { defaultParamMeta, parseParams, randomizeGroupParams } from "@jgengine/core/generator/paramSchema";
import { bakeGeneratorVariants, generatorVariants, getGenerator, runGenerator } from "@jgengine/core/generator/generator";
import { getSceneKind } from "@jgengine/core/scene/sceneKinds";
import { grassBareAt, grassStripeAt } from "./grassField";
import {
  GRASS_DEFAULTS,
  GRASS_FIELD_OUTPUT,
  GRASS_GENERATOR,
  GRASS_PRESETS,
  GRASS_SCHEMA,
  grassBladeDensity,
  readGrassLook,
  registerGrassKind,
  resolveGrassObject,
} from "./grassKind";

describe("readGrassLook", () => {
  test("fills defaults and reads overrides", () => {
    const look = readGrassLook({ windStrength: 0.5, tipColor: "#fff" });
    expect(look.windStrength).toBe(0.5);
    expect(look.tipColor).toBe("#fff");
    expect(look.density).toBe(GRASS_DEFAULTS.density);
    expect(look.groundCover).toBe(GRASS_DEFAULTS.groundCover);
  });

  test("grows everywhere by default and only above the ground height a field names", () => {
    expect(readGrassLook({}).growAbove).toBeLessThan(-50);
    expect(readGrassLook({ growAbove: 3.2 }).growAbove).toBe(3.2);
  });

  test("clamps every knob to its schema range and rejects bad colours", () => {
    const look = readGrassLook({ groundCover: 4, density: -3, bladeHeight: 90, tuftBlades: 4.6, clumping: 3, baseColor: "green", flowerColor: "#abcdef" });
    expect(look.groundCover).toBe(1);
    expect(look.density).toBe(0);
    expect(look.bladeHeight).toBe(2.5);
    expect(look.tuftBlades).toBe(5);
    expect(look.clumping).toBe(1);
    expect(look.baseColor).toBe(GRASS_DEFAULTS.baseColor);
    expect(look.flowerColor).toBe("#abcdef");
  });

  test("reads the same values the schema parser does", () => {
    const meta = { ...defaultParamMeta(GRASS_SCHEMA), season: 0.4, mixShare: 0.3 };
    const parsed = parseParams(GRASS_SCHEMA, meta);
    const look = readGrassLook(meta);
    for (const key of Object.keys(GRASS_DEFAULTS) as (keyof typeof GRASS_DEFAULTS)[]) expect(look[key]).toEqual(parsed[key] as never);
  });
});

describe("grass coverage", () => {
  test("blade count follows blade size, so thin, short or light grass still covers the ground", () => {
    const base = grassBladeDensity(GRASS_DEFAULTS);
    expect(grassBladeDensity({ ...GRASS_DEFAULTS, bladeWidth: GRASS_DEFAULTS.bladeWidth / 2 })).toBeCloseTo(base * 2, 5);
    expect(grassBladeDensity({ ...GRASS_DEFAULTS, bladeHeight: 0.1 })).toBeGreaterThan(base);
    expect(grassBladeDensity({ ...GRASS_DEFAULTS, density: 0 })).toBeGreaterThan(base * 0.6);
  });

  test("presets and randomized knobs all resolve inside the schema", () => {
    expect(GRASS_PRESETS.length).toBeGreaterThanOrEqual(6);
    let state = 3;
    const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    const looks = [...GRASS_PRESETS.map((preset) => preset.values), ...Array.from({ length: 50 }, () => {
      const meta: Record<string, unknown> = {};
      for (const group of [undefined, ...(GRASS_SCHEMA.groups ?? []).map((entry) => entry.id)]) Object.assign(meta, randomizeGroupParams(GRASS_SCHEMA, group, random));
      return meta;
    })];
    for (const meta of looks) {
      const look = readGrassLook(meta);
      expect(Number.isFinite(grassBladeDensity(look))).toBe(true);
      const width = look.bladeWidth * (1 - look.widthVariation * 0.3);
      const height = Math.min(1.2, look.bladeHeight * (1 - look.heightVariation * 0.3));
      expect(grassBladeDensity(look) * width * (0.3 + height)).toBeGreaterThanOrEqual(2.6 - 1e-9);
    }
  });
});

describe("resolveGrassObject", () => {
  test("sizes the patch from box half-extents at the box base", () => {
    const resolved = resolveGrassObject({ id: "meadow", kind: "grass_field", center: { x: 0, y: 4, z: 0 }, halfExtents: { x: 15, y: 2, z: 10 } });
    expect(resolved).not.toBeNull();
    expect(resolved!.size).toEqual([30, 20]);
    expect(resolved!.center[1]).toBe(2);
  });

  test("returns null without a center", () => {
    expect(resolveGrassObject({ id: "x", kind: "grass_field" })).toBeNull();
  });
});

describe("grass generator", () => {
  test("one schema spans a putting green to tall savanna and dune grass", () => {
    const ids = GRASS_PRESETS.map((preset) => preset.id);
    for (const id of ["green", "fairway", "lawn", "meadow", "savanna", "dune"]) expect(ids).toContain(id);
    const height = (id: string) => readGrassLook(GRASS_PRESETS.find((preset) => preset.id === id)?.values).bladeHeight;
    expect(height("green")).toBeLessThan(0.03);
    expect(height("savanna")).toBeGreaterThan(1.5);
  });

  test("registers with the grass_field kind and bakes deterministic LODs", () => {
    registerGrassKind();
    expect(getSceneKind("grass_field")?.generator).toBe("grass");
    expect(getGenerator("grass")?.output).toBe(GRASS_FIELD_OUTPUT);
    const a = runGenerator(GRASS_GENERATOR, { bladeHeight: 0.3, seed: "g" });
    const b = runGenerator(GRASS_GENERATOR, { bladeHeight: 0.3, seed: "g" });
    expect(a.template.position).toEqual(b.template.position);
    expect(a.look.seed).toBe("g");
    const [baked] = bakeGeneratorVariants(GRASS_GENERATOR, { seed: "g" }, { count: 1 });
    expect(baked?.lods.map((lod) => lod.output.segments)).toEqual([4, 2, 1]);
  });

  test("a variant grid around one look stays inside the schema", () => {
    const grid = generatorVariants(GRASS_GENERATOR, { ...GRASS_PRESETS[0]?.values, seed: "base" }, { count: 20, explore: 0.5 });
    expect(grid).toHaveLength(20);
    for (const variant of grid) expect(readGrassLook(variant.meta)).toEqual({ ...variant.params });
  });
});

describe("grass masks", () => {
  test("mow stripes alternate across their heading and vanish when off", () => {
    const look = { stripeWidth: 2, stripeContrast: 0.5, stripeAngle: 0 };
    expect(grassStripeAt(look, 1, 0)).toBeCloseTo(1);
    expect(grassStripeAt(look, 3, 0)).toBeCloseTo(-1);
    expect(grassStripeAt(look, 3, 7)).toBeCloseTo(-1);
    expect(grassStripeAt({ ...look, stripeWidth: 0 }, 3, 0)).toBe(0);
  });

  test("bare ground opens more of the field as it rises", () => {
    const share = (bareGround: number) => {
      let total = 0;
      for (let i = 0; i < 400; i += 1) total += grassBareAt({ bareGround, noiseScale: 18 }, 9, (i % 20) * 3.1, Math.floor(i / 20) * 3.1);
      return total / 400;
    };
    expect(share(0)).toBe(1);
    expect(share(0.3)).toBeGreaterThan(share(0.8));
    expect(share(0.8)).toBeLessThan(0.5);
  });
});
