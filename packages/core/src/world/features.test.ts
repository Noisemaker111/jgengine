import { describe, expect, test } from "bun:test";

import {
  biomes,
  building,
  environment,
  flat,
  grass,
  ocean,
  pad,
  padFlattenMasks,
  plots,
  rain,
  sky,
  snow,
  terrain,
  tilemap,
  voxel,
} from "./features";

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

  test("grid world kinds additively carry cells/cellSize/baseHeight/defaultColor", () => {
    const cells = [{ x: 0, z: 0, height: 2, color: "#ff0000" }, { x: 1, z: 0 }];
    expect(tilemap({ map: "./level.ts", cells, cellSize: 2, baseHeight: 1, defaultColor: "#888888" })).toEqual({
      kind: "tilemap",
      map: "./level.ts",
      cells,
      cellSize: 2,
      baseHeight: 1,
      defaultColor: "#888888",
    });
    expect(voxel({ seed: "world-1", cells })).toEqual({ kind: "voxel", seed: "world-1", cells });
    expect(biomes({ map: "./biomes.ts", zones: "./zones.ts", cells })).toEqual({
      kind: "biomes",
      map: "./biomes.ts",
      zones: "./zones.ts",
      cells,
    });
    expect(plots({ cells })).toEqual({ kind: "plots", cells });
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
    expect(sky()).toEqual({ kind: "sky", preset: "day", timeOfDay: false });
  });

  test("sky carries its config and lets environment attach it", () => {
    const descriptor = sky({
      preset: "dusk",
      timeOfDay: true,
      horizonColor: "#ff8a5c",
      zenithColor: "#1a2b4a",
      sunIntensity: 0.7,
      ambientIntensity: 0.4,
      fog: { color: "#ffb37a", near: 40, far: 220 },
    });
    expect(descriptor).toEqual({
      kind: "sky",
      preset: "dusk",
      timeOfDay: true,
      horizonColor: "#ff8a5c",
      zenithColor: "#1a2b4a",
      sunIntensity: 0.7,
      ambientIntensity: 0.4,
      fog: { color: "#ffb37a", near: 40, far: 220 },
    });

    const world = environment({ sky: descriptor });
    expect(world).toEqual({ kind: "environment", sky: descriptor });
  });

  test("terrain carries flatten masks", () => {
    const descriptor = terrain({
      height: 4,
      flatten: [{ center: [10, -5], radius: 6, height: 2, falloff: 3 }],
    });
    expect(descriptor.flatten).toEqual([{ center: [10, -5], radius: 6, height: 2, falloff: 3 }]);
  });

  test("pad applies conservative defaults and carries its config", () => {
    expect(pad({ center: [4, 6], size: [3, 2] })).toEqual({
      kind: "pad",
      center: [4, 6],
      size: [3, 2],
      height: 0.05,
      color: "#8b8680",
    });

    const circular = pad({ center: [0, 0], size: { radius: 5 }, height: 0.2, color: "#445566", rotationY: 0.4 });
    expect(circular).toEqual({
      kind: "pad",
      center: [0, 0],
      size: { radius: 5 },
      height: 0.2,
      color: "#445566",
      rotationY: 0.4,
    });
  });

  test("environment carries pads", () => {
    const world = environment({ pads: [pad({ center: [1, 2], size: [4, 4] })] });
    expect(world.pads).toEqual([
      { kind: "pad", center: [1, 2], size: [4, 4], height: 0.05, color: "#8b8680" },
    ]);
  });

  test("padFlattenMasks derives a radius from each pad's footprint, no explicit height", () => {
    const rect = pad({ center: [10, -5], size: [6, 4] });
    const circle = pad({ center: [-2, 3], size: { radius: 5 } });
    const masks = padFlattenMasks([rect, circle]);
    expect(masks[0]?.center).toEqual([10, -5]);
    expect(masks[0]?.radius).toBeCloseTo(3.6);
    expect(masks[1]).toEqual({ center: [-2, 3], radius: 6 });
  });

  test("environment merges implicit pad flatten masks with explicit terrain.flatten", () => {
    const world = environment({
      terrain: terrain({ flatten: [{ center: [0, 0], radius: 2, height: 1 }] }),
      pads: [pad({ center: [20, 20], size: [4, 4] })],
    });
    expect(world.terrain?.flatten).toEqual([
      { center: [0, 0], radius: 2, height: 1 },
      { center: [20, 20], radius: 2.4 },
    ]);
  });

  test("environment leaves terrain untouched when there are no pads", () => {
    const world = environment({ terrain: terrain({ height: 2 }) });
    expect(world.terrain?.flatten).toBeUndefined();
  });
});
