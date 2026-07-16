import { describe, expect, test } from "bun:test";

import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import {
  createModelMapResolver,
  pickModel,
  resolveModel,
  resolveModelPlan,
  tryResolveCatalogModel,
} from "./resolveModel";

describe("resolveModel", () => {
  const assets = createAssetCatalog();
  assets.register("quaternius-modular-scifi/astronautA", { url: "/models/quaternius-modular-scifi/astronautA.glb" });
  assets.register("crate", {
    url: "/models/crate.glb",
    dims: { footprint: { w: 1, d: 1 }, center: { x: 0.5, z: 0.5 }, minY: 0 },
  });

  test("resolves a known string id to a ModelConfig", () => {
    expect(resolveModel("quaternius-modular-scifi/astronautA", assets)).toEqual({
      url: "/models/quaternius-modular-scifi/astronautA.glb",
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

describe("createModelMapResolver", () => {
  const assets = createAssetCatalog();
  assets.register("scatter/pine", { url: "/models/quaternius-stylized-nature/tree_pine.glb" });

  test("undefined when either the map or the catalog is missing", () => {
    expect(createModelMapResolver(undefined, assets, "scatterModels")).toBeUndefined();
    expect(createModelMapResolver({ pine: "scatter/pine" }, undefined, "scatterModels")).toBeUndefined();
  });

  test("unmapped key resolves to null — the deliberate proxy fallback", () => {
    const resolveItem = createModelMapResolver({ pine: "scatter/pine" }, assets, "scatterModels")!;
    expect(resolveItem("grass")).toBeNull();
  });

  test("mapped key resolves through the catalog", () => {
    const resolveItem = createModelMapResolver({ pine: "scatter/pine" }, assets, "scatterModels")!;
    expect(resolveItem("pine")).toEqual({ url: "/models/quaternius-stylized-nature/tree_pine.glb" });
  });

  test("mapped key with a missing catalog id throws, naming the seam and key", () => {
    const resolveItem = createModelMapResolver({ pine: "typo/pine" }, assets, "scatterModels")!;
    expect(() => resolveItem("pine")).toThrow(/scatterModels\["pine"\] → "typo\/pine"/);
  });
});

describe("pickModel / resolveModelPlan", () => {
  const assets = createAssetCatalog();
  assets.register("quaternius-modular-scifi/astronautA", {
    url: "/models/quaternius-modular-scifi/astronautA.glb",
  });
  assets.register("kaykit-adventurers/Rogue", { url: "/models/kaykit-adventurers/Rogue.glb" });

  test("prefers model when live", () => {
    expect(
      pickModel(assets, {
        model: "kaykit-adventurers/Rogue",
        fallbackModel: "quaternius-modular-scifi/astronautA",
        style: { targetHeight: 1.8 },
      }),
    ).toEqual({
      url: "/models/kaykit-adventurers/Rogue.glb",
      targetHeight: 1.8,
    });
  });

  test("falls through to fallbackModel when preferred is missing", () => {
    expect(
      pickModel(assets, {
        model: "missing/pack",
        fallbackModel: "quaternius-modular-scifi/astronautA",
      }),
    ).toEqual({ url: "/models/quaternius-modular-scifi/astronautA.glb" });
  });

  test("returns undefined when neither id is in the catalog (primitive seam)", () => {
    expect(pickModel(assets, { model: "a/b", fallbackModel: "c/d" })).toBeUndefined();
  });

  test("resolveModelPlan omits unresolved keys", () => {
    expect(
      resolveModelPlan(assets, {
        hero: { model: "kaykit-adventurers/Rogue" },
        crate: { model: "missing/box" },
      }),
    ).toEqual({
      hero: { url: "/models/kaykit-adventurers/Rogue.glb" },
    });
  });
});
