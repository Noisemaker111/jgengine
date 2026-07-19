import { describe, expect, test } from "bun:test";

import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import {
  createModelMapResolver,
  pickModel,
  resolveEntityModel,
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

  test("resolves a known string id to a ModelConfig with auto animation", () => {
    expect(resolveModel("quaternius-modular-scifi/astronautA", assets)).toEqual({
      url: "/models/quaternius-modular-scifi/astronautA.glb",
      animation: "auto",
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

  test("passes the catalog collisionMesh through by identity, and absent stays absent", () => {
    const collisionMesh = {
      min: [-1, 0, -1] as const,
      max: [1, 2, 1] as const,
      vertexCount: 3,
      triangleCount: 1,
      positions: "AAAA",
      indices: "AAAA",
    };
    const meshAssets = createAssetCatalog();
    meshAssets.register("arch", { url: "/models/arch.glb", collisionMesh });
    meshAssets.register("plain", { url: "/models/plain.glb" });
    expect(resolveModel("arch", meshAssets)?.collisionMesh).toBe(collisionMesh);
    expect(resolveModel("plain", meshAssets)).not.toHaveProperty("collisionMesh");
  });
});

describe("tryResolveCatalogModel", () => {
  const assets = createAssetCatalog();
  assets.register("tree", { url: "/models/tree.glb" });

  test("resolves when the catalog id is a model asset", () => {
    expect(tryResolveCatalogModel("tree", assets)).toEqual({ url: "/models/tree.glb", animation: "auto" });
  });

  test("returns undefined without throwing when the catalog id is not a model", () => {
    expect(tryResolveCatalogModel("spawn-pad", assets)).toBeUndefined();
  });
});

describe("resolveEntityModel", () => {
  const assets = createAssetCatalog();
  assets.register("hero", { url: "/models/hero.glb" });
  assets.register("sword", { url: "/models/sword.glb" });

  test("passes through a plain catalog id", () => {
    expect(resolveEntityModel("hero", assets, "player")).toEqual({ url: "/models/hero.glb", animation: "auto" });
  });

  test("resolves attachment models through the catalog", () => {
    const resolved = resolveEntityModel(
      {
        url: "/models/hero.glb",
        attachments: [{ bone: "hand_r", model: "sword" }],
      },
      assets,
      "player",
    );
    expect(resolved?.attachments?.[0]?.model).toEqual({ url: "/models/sword.glb", animation: "auto" });
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
    expect(resolveItem("pine")).toEqual({
      url: "/models/quaternius-stylized-nature/tree_pine.glb",
      animation: "auto",
    });
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
      animation: "auto",
    });
  });

  test("explicit style.animation overrides the auto stamp", () => {
    const animation = { states: { idle: "Idle", walk: "Walking_A" } };
    expect(pickModel(assets, { model: "kaykit-adventurers/Rogue", style: { animation } })?.animation).toBe(animation);
  });

  test('style.animation "none" opts out of auto animation', () => {
    expect(pickModel(assets, { model: "kaykit-adventurers/Rogue", style: { animation: "none" } })?.animation).toBe(
      "none",
    );
  });

  test("falls through to fallbackModel when preferred is missing", () => {
    expect(
      pickModel(assets, {
        model: "missing/pack",
        fallbackModel: "quaternius-modular-scifi/astronautA",
      }),
    ).toEqual({ url: "/models/quaternius-modular-scifi/astronautA.glb", animation: "auto" });
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
      hero: { url: "/models/kaykit-adventurers/Rogue.glb", animation: "auto" },
    });
  });
});
