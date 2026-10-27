import { describe, expect, test } from "bun:test";

import { orderPrefetch, prefetchTier } from "./prefetchTier";

describe("prefetch tiers", () => {
  test("names distance and LOD versions far", () => {
    expect(prefetchTier("/models/library/city/street-lamp/far.gltf")).toBe("far");
    expect(prefetchTier("/models/rock_LOD2.glb")).toBe("far");
    expect(prefetchTier("/models/library/city/street-lamp/near.gltf")).toBe("near");
    expect(prefetchTier("/models/farmhouse.glb")).toBe("near");
  });

  test("orders near files first and drops repeats", () => {
    const ordered = orderPrefetch([
      { path: "/a/far.gltf", tier: "far" },
      { path: "/a/near.gltf", tier: "near" },
      { path: "/b.glb", tier: "near" },
      { path: "/b.glb", tier: "near" },
    ]);
    expect(ordered.map((item) => item.path)).toEqual(["/a/near.gltf", "/b.glb", "/a/far.gltf"]);
  });
});
