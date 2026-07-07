import { describe, expect, test } from "bun:test";

import { biomes, building, environment, flat, grass, ocean, plots, rain, snow, terrain, tilemap, voxel } from "./features";

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

  test("environment composes renderable descriptor groups", () => {
    const world = environment({
      terrain: terrain({ heightMap: "./height.png", bounds: { w: 512, d: 256 } }),
      weather: [rain({ density: 0.8 }), snow({ speed: 1.5 })],
      vegetation: grass({ seed: "field-1" }),
      water: ocean({ level: -1 }),
      structures: building({ count: 12, style: "village" }),
    });

    expect(world).toEqual({
      kind: "environment",
      terrain: {
        kind: "terrain",
        bounds: { w: 512, d: 256 },
        height: 0,
        heightMap: "./height.png",
      },
      weather: [
        {
          kind: "rain",
          area: { w: 256, d: 256, h: 80 },
          density: 0.8,
          speed: 18,
          dropLength: 0.8,
          wind: [0, 0],
          color: "#9ec8ff",
        },
        {
          kind: "snow",
          area: { w: 256, d: 256, h: 80 },
          density: 0.35,
          speed: 1.5,
          flakeSize: 0.08,
          drift: 0.4,
          wind: [0, 0],
          color: "#ffffff",
        },
      ],
      vegetation: [
        {
          kind: "grass",
          area: { w: 128, d: 128 },
          density: 4,
          bladeHeight: [0.25, 0.9],
          bladeWidth: 0.035,
          windStrength: 0.35,
          colors: ["#3f7d2d", "#66a83f"],
          seed: "field-1",
        },
      ],
      water: [
        {
          kind: "ocean",
          bounds: { w: 1024, d: 1024 },
          level: -1,
          waveHeight: 1.2,
          waveScale: 18,
          waveSpeed: 0.55,
          color: "#1d7fa3",
        },
      ],
      structures: [
        {
          kind: "building",
          count: 12,
          footprint: { w: 8, d: 8 },
          stories: [1, 4],
          storyHeight: 3,
          spacing: 2,
          style: "village",
        },
      ],
    });
  });

  test("environment omits empty groups and descriptors stay serializable", () => {
    expect(environment()).toEqual({ kind: "environment" });

    const descriptor = environment({
      terrain: terrain({ material: "sand", seed: "shore" }),
      weather: rain({ wind: [1, -0.5] }),
      water: ocean(),
    });

    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  test("individual environment builders apply conservative defaults", () => {
    expect(terrain()).toEqual({ kind: "terrain", bounds: { w: 512, d: 512 }, height: 0 });
    expect(rain()).toMatchObject({ kind: "rain", density: 0.65, speed: 18 });
    expect(snow()).toMatchObject({ kind: "snow", density: 0.35, drift: 0.4 });
    expect(grass()).toMatchObject({ kind: "grass", density: 4, bladeHeight: [0.25, 0.9] });
    expect(ocean()).toMatchObject({ kind: "ocean", bounds: { w: 1024, d: 1024 }, waveHeight: 1.2 });
    expect(building()).toMatchObject({ kind: "building", count: 1, stories: [1, 4], style: "generic" });
  });
});
