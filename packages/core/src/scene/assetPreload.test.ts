import { describe, expect, test } from "bun:test";
import { createSceneAssetPreloader } from "@jgengine/core/scene/assetPreload";

describe("scene asset preload", () => {
  test("createSceneAssetPreloader deduplicates urls", () => {
    const fetched: string[] = [];
    const preloader = createSceneAssetPreloader((url) => {
      fetched.push(url);
    });
    preloader.preloadUrl("/models/test.glb");
    preloader.preloadUrl("/models/test.glb");
    expect(fetched).toEqual(["/models/test.glb"]);
    expect(preloader.hasPreloaded("/models/test.glb")).toBe(true);
  });
});