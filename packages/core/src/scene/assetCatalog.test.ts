import { describe, expect, test } from "bun:test";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

describe("asset catalog", () => {
  test("register then resolve returns the registered asset", () => {
    const catalog = createAssetCatalog<{ url: string; label: string }>();
    catalog.register("rack.basic", { url: "/models/rack.glb", label: "Basic Rack" });
    expect(catalog.resolve("rack.basic")).toEqual({ url: "/models/rack.glb", label: "Basic Rack" });
  });

  test("resolve returns null for an unregistered id", () => {
    const catalog = createAssetCatalog();
    expect(catalog.resolve("missing")).toBeNull();
  });

  test("has reflects registration state", () => {
    const catalog = createAssetCatalog();
    expect(catalog.has("rack.basic")).toBe(false);
    catalog.register("rack.basic", { url: "/models/rack.glb" });
    expect(catalog.has("rack.basic")).toBe(true);
  });

  test("ids lists every registered id", () => {
    const catalog = createAssetCatalog();
    catalog.register("a", { url: "/models/a.glb" });
    catalog.register("b", { url: "/models/b.glb" });
    expect(catalog.ids().sort()).toEqual(["a", "b"]);
  });

  test("re-registering an id overwrites the previous asset", () => {
    const catalog = createAssetCatalog();
    catalog.register("rack.basic", { url: "/models/v1.glb" });
    catalog.register("rack.basic", { url: "/models/v2.glb" });
    expect(catalog.resolve("rack.basic")).toEqual({ url: "/models/v2.glb" });
    expect(catalog.ids()).toEqual(["rack.basic"]);
  });
});
