import { describe, expect, test } from "bun:test";

import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { resolveModel, tryResolveCatalogModel } from "./resolveModel";

describe("resolveModel", () => {
  const assets = createAssetCatalog();
  assets.register("kenney-space/astronautA", { url: "/models/kenney-space/astronautA.glb" });
  assets.register("crate", {
    url: "/models/crate.glb",
    dims: { footprint: { w: 1, d: 1 }, center: { x: 0.5, z: 0.5 }, minY: 0 },
  });

  test("resolves a known string id to a ModelConfig", () => {
    expect(resolveModel("kenney-space/astronautA", assets)).toEqual({
      url: "/models/kenney-space/astronautA.glb",
    });
  });

  test("forwards an explicit ModelConfig unchanged", () => {
    const config = { url: "/custom.glb", scale: 2 };
    expect(resolveModel(config, assets)).toBe(config);
  });

  test("undefined stays undefined (deliberate primitive fallback)", () => {
    expect(resolveModel(undefined, assets)).toBeUndefined();
  });

  test("throws a loud error naming entityModels key and missing id", () => {
    expect(() =>
      resolveModel("typo/hero", assets, { seam: "entityModels", key: "hero" }),
    ).toThrow(/entityModels\["hero"\] → "typo\/hero"/);
  });

  test("throws a loud error naming objectModels key and missing id", () => {
    expect(() =>
      resolveModel("missing-pack/box", assets, { seam: "objectModels", key: "crate" }),
    ).toThrow(/objectModels\["crate"\] → "missing-pack\/box"/);
  });

  test("includes dims when the catalog entry has them", () => {
    expect(resolveModel("crate", assets)?.dims?.footprint).toEqual({ w: 1, d: 1 });
  });
});

describe("tryResolveCatalogModel", () => {
  const assets = createAssetCatalog();
  assets.register("tree", { url: "/models/tree.glb" });

  test("resolves when the catalog id is a model asset", () => {
    expect(tryResolveCatalogModel("tree", assets)).toEqual({ url: "/models/tree.glb" });
  });

  test("returns undefined without throwing when the catalog id is not a model", () => {
    expect(tryResolveCatalogModel("spawn-pad", assets)).toBeUndefined();
  });
});
