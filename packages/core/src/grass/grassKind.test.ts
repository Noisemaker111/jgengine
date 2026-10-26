import { describe, expect, test } from "bun:test";

import { defaultParamMeta, parseParams, randomizeGroupParams } from "@jgengine/core/scene/sceneKinds";
import { GRASS_DEFAULTS, GRASS_PRESETS, GRASS_SCHEMA, grassBladeDensity, readGrassLook, resolveGrassObject } from "./grassKind";

describe("readGrassLook", () => {
  test("fills defaults and reads overrides", () => {
    const look = readGrassLook({ windStrength: 0.5, tipColor: "#fff" });
    expect(look.windStrength).toBe(0.5);
    expect(look.tipColor).toBe("#fff");
    expect(look.density).toBe(GRASS_DEFAULTS.density);
    expect(look.groundCover).toBe(GRASS_DEFAULTS.groundCover);
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
