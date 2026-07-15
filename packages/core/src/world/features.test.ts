import { describe, expect, spyOn, test } from "bun:test";

import {
  biomes,
  building,
  environment,
  flat,
  grass,
  island,
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
          width: 0.018,
          opacity: 0.48,
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
          opacity: 0.86,
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

  test("biomeBand weather expands into positioned strips alongside explicit weather", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    let world;
    try {
      world = environment({
        terrain: terrain({
          bounds: { w: 400, d: 600 },
          biomeBands: [
            { z: -150, fade: 50, material: "grass", weather: "rain" },
            { z: 150, material: "snow", weather: "snow" },
            { z: 0, material: "sand" },
          ],
        }),
        weather: rain({ density: 0.9 }),
      });
    } finally {
      warn.mockRestore();
    }

    expect(world.weather).toHaveLength(3);
    expect(world.weather![0]).toMatchObject({ kind: "rain", density: 0.9 });
    expect(world.weather![1]).toMatchObject({
      kind: "rain",
      area: { w: 400, d: 50, h: 80, position: [0, -150] },
    });
    expect(world.weather![2]).toMatchObject({
      kind: "snow",
      area: { w: 400, d: 64, h: 80, position: [0, 150] },
    });
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
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
    expect(rain()).toMatchObject({ kind: "rain", density: 0.65, speed: 18, width: 0.018, opacity: 0.48 });
    expect(snow()).toMatchObject({ kind: "snow", density: 0.35, drift: 0.4, opacity: 0.86 });
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
      radius: 2600,
      hazeStrength: 0.62,
      sunGlowStrength: 0.6,
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
      radius: 2600,
      hazeStrength: 0.62,
      sunGlowStrength: 0.6,
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

  test("island carries its origin plus terrain defaults", () => {
    expect(island({ origin: [10, 20], height: 5 })).toEqual({
      kind: "island",
      origin: [10, 20],
      bounds: { w: 512, d: 512 },
      height: 5,
    });
  });

  test("pad carries an absolute elevation", () => {
    const elevated = pad({ center: [0, 0], size: [4, 4], elevation: 12 });
    expect(elevated.elevation).toBe(12);
  });

  test("padFlattenMasks skips elevated pads", () => {
    const grounded = pad({ center: [0, 0], size: [4, 4] });
    const elevated = pad({ center: [10, 10], size: [4, 4], elevation: 8 });
    expect(padFlattenMasks([grounded, elevated])).toHaveLength(1);
  });

  test("environment carries an islands list", () => {
    const islands = [island({ origin: [0, 0], height: 1 }), island({ origin: [50, 0], height: 2 })];
    expect(environment({ islands }).islands).toEqual(islands);
  });

  test("ocean carries a levelAt schedule function", () => {
    const levelAt = (t: number) => t * 2;
    expect(ocean({ levelAt }).levelAt).toBe(levelAt);
  });

  test("terrain warns once when baseHeight is set without height or heightField", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      terrain({ baseHeight: 5 });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  test("terrain does not warn when baseHeight is paired with height or heightField", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      terrain({ baseHeight: 5, height: 0 });
      terrain({ baseHeight: 5, heightField: () => 1 });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("rain/snow expose width/opacity knobs independent of area size", () => {
    expect(rain({ area: { w: 60, d: 60, h: 45 }, width: 0.03, opacity: 0.7 })).toMatchObject({
      width: 0.03,
      opacity: 0.7,
    });
    expect(snow({ area: { w: 60, d: 60, h: 45 }, opacity: 0.95 })).toMatchObject({ opacity: 0.95 });
  });

  test("rain/snow warn when an explicit area is far larger than camera scale", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      rain({ area: { w: 260, d: 260, h: 70 } });
      snow({ area: { w: 260, d: 260, h: 70 } });
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  test("rain/snow do not warn for camera-scale areas or the implicit default", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      rain({ area: { w: 70, d: 70, h: 45 } });
      snow({ area: { w: 70, d: 70, h: 45 } });
      rain();
      snow();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
