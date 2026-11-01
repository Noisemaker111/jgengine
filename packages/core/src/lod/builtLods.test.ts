import { describe, expect, test } from "bun:test";

import {
  BUILT_LOD_VERSION,
  builtLodDir,
  builtLodFileUrl,
  builtLodMetaUrl,
  hasBuiltLodPath,
  IMPOSTOR_LEVEL_URL,
  meshLodSettings,
  parseBuiltLodMeta,
  projectedScreenSize,
  resolveBuiltLods,
  screenSizeDistance,
  type BuiltLodMeta,
} from "./builtLods";
import { createModelVariantSelector } from "./modelLod";

const META: BuiltLodMeta = {
  version: BUILT_LOD_VERSION,
  source: "abc",
  plan: "p",
  bounds: { min: [-1, 0, -1], max: [1, 4, 1] },
  triangles: 10_000,
  levels: [
    { file: "lod1.glb", ratio: 0.4, triangles: 4_000 },
    { file: "lod2.glb", ratio: 0.1, triangles: 1_000 },
  ],
  impostor: { albedo: "impostor-albedo.png", normal: "impostor-normal.png", frames: 8, cell: 128, center: [0, 2, 0], radius: 2.4 },
};

const FOV = Math.PI / 3;

describe("built lod files", () => {
  test("live in one folder beside the model, whatever query the url carries", () => {
    expect(builtLodDir("/models/tree.glb")).toBe("/models/tree.glb.lods");
    expect(builtLodMetaUrl("/models/tree.glb?v=2")).toBe("/models/tree.glb.lods/meta.json");
    expect(builtLodFileUrl("/m/near.gltf", "lod1.glb")).toBe("/m/near.gltf.lods/lod1.glb");
    expect(hasBuiltLodPath("data:model/gltf+json;base64,AA")).toBe(false);
    expect(hasBuiltLodPath("/models/tree.glb")).toBe(true);
  });

  test("a meta from another version or with a broken level reads as nothing built", () => {
    expect(parseBuiltLodMeta(JSON.parse(JSON.stringify(META)))).toEqual(META);
    expect(parseBuiltLodMeta({ ...META, version: BUILT_LOD_VERSION + 1 })).toBeNull();
    expect(parseBuiltLodMeta({ ...META, levels: [{ file: 3 }] })).toBeNull();
    expect(parseBuiltLodMeta("<!doctype html>")).toBeNull();
    const { impostor: _impostor, ...bare } = META;
    expect(parseBuiltLodMeta(bare)?.impostor).toBeUndefined();
  });
});

describe("screen size", () => {
  test("distance and projected size invert each other", () => {
    for (const size of [0.5, 0.1, 0.01]) {
      const distance = screenSizeDistance(3, size, FOV);
      expect(projectedScreenSize(3, distance, FOV)).toBeCloseTo(size, 9);
    }
    // A 1 m sphere spans the whole 90-degree view at 1 m.
    expect(screenSizeDistance(1, 1, Math.PI / 2)).toBeCloseTo(1, 9);
  });

  test("stays finite at the ends of the dial", () => {
    expect(Number.isFinite(screenSizeDistance(1, 0, FOV))).toBe(true);
    expect(Number.isFinite(screenSizeDistance(1, 1, Math.PI))).toBe(true);
    expect(Number.isFinite(screenSizeDistance(1, 1, 0))).toBe(true);
  });
});

describe("resolveBuiltLods", () => {
  test("turns screen sizes into distances for the source, each built level and the impostor", () => {
    const resolved = resolveBuiltLods("/t.glb", META, { screenSizes: [0.3, 0.1], impostorDistance: 200 }, 2, FOV);
    expect(resolved?.impostor).toBe(true);
    const levels = resolved?.variants.levels ?? [];
    expect(levels.map((level) => level.url)).toEqual(["/t.glb", "/t.glb.lods/lod1.glb", "/t.glb.lods/lod2.glb", IMPOSTOR_LEVEL_URL]);
    expect(levels[0]?.maxDistance).toBeCloseTo(screenSizeDistance(2, 0.3, FOV), 9);
    expect(levels[1]?.maxDistance).toBeCloseTo(screenSizeDistance(2, 0.1, FOV), 9);
    expect(levels[2]?.maxDistance).toBe(200);
    expect(levels[3]?.maxDistance).toBeUndefined();
    expect(resolved?.variants.scaleWithInstance).toBe(true);
    expect(() => createModelVariantSelector(resolved?.variants ?? { levels: [] })).not.toThrow();
  });

  test("an impostor nearer than a level's switch drops that level; no atlas means no impostor", () => {
    const near = resolveBuiltLods("/t.glb", META, { screenSizes: [0.3, 0.01], impostorDistance: 40 }, 2, FOV);
    expect(near?.variants.levels.map((level) => level.url)).toEqual(["/t.glb", "/t.glb.lods/lod1.glb", IMPOSTOR_LEVEL_URL]);
    const { impostor: _impostor, ...bare } = META;
    const without = resolveBuiltLods("/t.glb", bare, { screenSizes: [0.3], impostorDistance: 40 }, 2, FOV);
    expect(without?.impostor).toBe(false);
    expect(without?.variants.levels.map((level) => level.url)).toEqual(["/t.glb", "/t.glb.lods/lod1.glb"]);
  });

  test("uses no more levels than both the game and the build name, and nothing when neither adds one", () => {
    expect(resolveBuiltLods("/t.glb", META, { screenSizes: [0.2] }, 2, FOV)?.variants.levels).toHaveLength(2);
    expect(resolveBuiltLods("/t.glb", { ...META, levels: [] }, { screenSizes: [0.2] }, 2, FOV)).toBeNull();
    expect(resolveBuiltLods("/t.glb", META, { screenSizes: [] }, 2, FOV)).toBeNull();
  });

  test("hysteresis is a share of each switch distance", () => {
    const resolved = resolveBuiltLods("/t.glb", META, { screenSizes: [0.2], hysteresis: 0.25 }, 2, FOV);
    if (resolved === null) throw new Error("expected levels");
    const edge = resolved.variants.levels[0]?.maxDistance ?? 0;
    const selector = createModelVariantSelector(resolved.variants);
    expect(selector.level("a", edge * 0.5)).toBe(0);
    expect(selector.level("a", edge * 1.2)).toBe(0);
    expect(selector.level("a", edge * 1.3)).toBe(1);
    expect(selector.level("a", edge * 0.8)).toBe(1);
    expect(selector.level("a", edge * 0.7)).toBe(0);
  });
});

describe("meshLodSettings", () => {
  test("a model overrides the game field by field and false turns it off", () => {
    const game = { screenSizes: [0.3, 0.1], impostorDistance: 150 };
    expect(meshLodSettings(game, undefined)).toEqual(game);
    expect(meshLodSettings(game, { impostorDistance: 90 })).toEqual({ screenSizes: [0.3, 0.1], impostorDistance: 90 });
    expect(meshLodSettings(game, false)).toBeNull();
    expect(meshLodSettings(undefined, undefined)).toBeNull();
    expect(meshLodSettings(undefined, { impostorDistance: 90 })).toBeNull();
    expect(meshLodSettings(undefined, { screenSizes: [0.2] })).toEqual({ screenSizes: [0.2] });
  });
});
