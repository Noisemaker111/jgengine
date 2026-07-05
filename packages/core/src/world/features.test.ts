import { describe, expect, test } from "bun:test";

import { biomes, flat, plots, tilemap, voxel } from "./features";

describe("world features", () => {
  test("biomes carries its config", () => {
    expect(biomes({ map: "./biomes.ts", zones: "./zones.ts", bounds: { w: 2048, d: 2048 } })).toEqual({
      kind: "biomes",
      map: "./biomes.ts",
      zones: "./zones.ts",
      bounds: { w: 2048, d: 2048 },
    });
  });

  test("voxel carries its config", () => {
    expect(voxel({ seed: "world-1", generate: "./generate.ts", streaming: { radius: 8 } })).toEqual({
      kind: "voxel",
      seed: "world-1",
      generate: "./generate.ts",
      streaming: { radius: 8 },
    });
  });

  test("plots, tilemap, and flat carry their kinds", () => {
    expect(plots({ city: "./city.ts" })).toEqual({ kind: "plots", city: "./city.ts" });
    expect(plots()).toEqual({ kind: "plots" });
    expect(tilemap({ map: "./level.ts" })).toEqual({ kind: "tilemap", map: "./level.ts" });
    expect(flat()).toEqual({ kind: "flat" });
  });
});
