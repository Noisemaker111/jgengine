import { describe, expect, test } from "bun:test";

import { environment, island, terrain } from "./features";
import {
  arenaField,
  composeIslandFields,
  createTerrainPaletteSampler,
  fractalNoise,
  flatField,
  groundFieldFor,
  heightMapField,
  ISLAND_VOID_HEIGHT,
  noiseField,
  resolveEnvironmentField,
  resolveGroundStep,
  resolveTerrainField,
  resolveTerrainPalette,
  sampleSlope,
  slopeForce,
  snapEntityToGround,
  snapToGround,
  TERRAIN_MATERIAL_PALETTES,
  valueNoise,
  type GroundSnapEntityStore,
  type GroundSnapTarget,
} from "./terrain";

describe("terrain field", () => {
  test("valueNoise is deterministic and in [-1, 1]", () => {
    for (const [x, z] of [[0.3, 0.7], [12.5, -4.2], [-100.1, 88.8]] as const) {
      const a = valueNoise(x, z, 7);
      expect(a).toBe(valueNoise(x, z, 7));
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThanOrEqual(1);
    }
  });

  test("flatField is level with an up normal", () => {
    const field = flatField();
    expect(field.sampleHeight(3, -9)).toBe(0);
    expect(field.sampleNormal(3, -9)).toEqual([0, 1, 0]);
  });

  test("groundFieldFor matches the environment terrain field and is flat elsewhere", () => {
    const descriptor = terrain({ height: 3.2, seed: "ground-seam", frequency: 0.05 });
    const ground = groundFieldFor(environment({ terrain: descriptor }));
    const reference = resolveTerrainField(descriptor);
    for (const [x, z] of [[0, 0], [12.5, -30.25], [-81, 44]] as const) {
      expect(ground.sampleHeight(x, z)).toBe(reference.sampleHeight(x, z));
    }
    expect(groundFieldFor({ kind: "flat" }).sampleHeight(5, 5)).toBe(0);
    expect(groundFieldFor(undefined).sampleHeight(5, 5)).toBe(0);
    expect(groundFieldFor(environment()).sampleHeight(5, 5)).toBe(0);
  });

  test("noiseField scales with amplitude and is reproducible per seed", () => {
    const low = noiseField({ seed: "s", amplitude: 1, frequency: 0.1 });
    const high = noiseField({ seed: "s", amplitude: 4, frequency: 0.1 });
    const x = 17.3;
    const z = -8.1;
    expect(high.sampleHeight(x, z)).toBeCloseTo(low.sampleHeight(x, z) * 4, 6);
    expect(low.sampleHeight(x, z)).toBe(noiseField({ seed: "s", amplitude: 1, frequency: 0.1 }).sampleHeight(x, z));
  });

  test("sampleNormal returns a unit vector", () => {
    const field = noiseField({ seed: 3, amplitude: 5, frequency: 0.08 });
    const [nx, ny, nz] = field.sampleNormal(5, 5);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
    expect(ny).toBeGreaterThan(0);
  });

  test("noiseField carries bounds and waterLevel", () => {
    const field = noiseField({ bounds: { w: 64, d: 32 }, waterLevel: -2 });
    expect(field.bounds).toEqual({ w: 64, d: 32 });
    expect(field.waterLevel).toBe(-2);
  });

  test("resolveTerrainField maps an environment descriptor to a field", () => {
    expect(resolveTerrainField().sampleHeight(1, 1)).toBe(0);
    const field = resolveTerrainField(terrain({ height: 3, seed: "isle", waterLevel: -1, bounds: { w: 200, d: 200 } }));
    expect(field.waterLevel).toBe(-1);
    expect(field.bounds).toEqual({ w: 200, d: 200 });
    expect(field.sampleHeight(4, 4)).toBe(
      noiseField({ amplitude: 3, seed: "isle", waterLevel: -1, bounds: { w: 200, d: 200 } }).sampleHeight(4, 4),
    );
  });

  test("resolveGroundStep blocks steps that exceed the slope limit", () => {
    const cliff = { sampleHeight: (x: number) => (x > 0 ? 100 : 0), sampleNormal: () => [0, 1, 0] as const };
    const blocked = resolveGroundStep(cliff, 0, 0, 1, 0, 0.6);
    expect(blocked.stepX).toBe(0);
    const flat = resolveGroundStep(flatField(), 0, 0, 1, 1, 0.6);
    expect(flat).toEqual({ stepX: 1, stepZ: 1 });
  });

  test("arenaField flattens the spawn and exposes a water level", () => {
    const field = arenaField({ seed: "duel" });
    expect(Math.abs(field.sampleHeight(0, 0))).toBeLessThan(0.05);
    expect(field.waterLevel).toBeLessThan(0);
  });

  test("resolveTerrainPalette resolves material presets and explicit color overrides", () => {
    expect(resolveTerrainPalette()).toEqual(TERRAIN_MATERIAL_PALETTES.grass);
    expect(resolveTerrainPalette({ material: "ash" })).toEqual(TERRAIN_MATERIAL_PALETTES.ash);
    expect(resolveTerrainPalette({ material: "highland" })).toEqual(TERRAIN_MATERIAL_PALETTES.highland);
    expect(resolveTerrainPalette({ material: "slate" })).toEqual(TERRAIN_MATERIAL_PALETTES.slate);
    expect(resolveTerrainPalette({ material: "ash", colors: { low: "#000000" } })).toEqual({
      low: "#000000",
      high: TERRAIN_MATERIAL_PALETTES.ash.high,
      waterline: TERRAIN_MATERIAL_PALETTES.ash.waterline,
    });
  });

  test("resolveTerrainPalette rejects unknown material names instead of silently falling back", () => {
    expect(() => resolveTerrainPalette({ material: "grassland" as never })).toThrow(/Unknown terrain material "grassland"/);
    expect(() => resolveTerrainPalette({ material: "highland-turf" as never })).toThrow(/Valid materials:/);
  });

  test("every terrain material palette is visually distinct", () => {
    const highs = Object.values(TERRAIN_MATERIAL_PALETTES).map((palette) => palette.high);
    expect(new Set(highs).size).toBe(highs.length);
  });

  test("snapToGround replaces y with the field height at x/z, plus offset", () => {
    const field = noiseField({ seed: "snap", amplitude: 3, frequency: 0.05 });
    const [x, y, z] = snapToGround(field, [12, 99, -7]);
    expect(x).toBe(12);
    expect(z).toBe(-7);
    expect(y).toBe(field.sampleHeight(12, -7));

    const [, offsetY] = snapToGround(field, [12, 99, -7], 1.5);
    expect(offsetY).toBeCloseTo(field.sampleHeight(12, -7) + 1.5, 6);
  });

  test("snapEntityToGround round-trips through a stub entity store", () => {
    const field = noiseField({ seed: "snap-entity", amplitude: 2, frequency: 0.05 });
    const positions = new Map<string, readonly [number, number, number]>([["hero", [5, 0, -3]]]);
    const store: GroundSnapEntityStore = {
      get(id): GroundSnapTarget | null {
        const position = positions.get(id);
        return position === undefined ? null : { position };
      },
      setPose(id, pose) {
        if (!positions.has(id) || pose.position === undefined) return false;
        positions.set(id, pose.position);
        return true;
      },
    };

    expect(snapEntityToGround(store, "missing", field)).toBe(false);

    const result = snapEntityToGround(store, "hero", field);
    expect(result).toBe(true);
    expect(positions.get("hero")).toEqual([5, field.sampleHeight(5, -3), -3]);
  });

  test("resolveTerrainField flatten masks carve a flat pad with a blended ring", () => {
    const flat = terrain({
      height: 6,
      seed: "flatten",
      frequency: 0.05,
      flatten: [{ center: [20, -10], radius: 8, height: 3, falloff: 6 }],
    });
    const field = resolveTerrainField(flat);
    const unflattened = resolveTerrainField(terrain({ height: 6, seed: "flatten", frequency: 0.05 }));

    expect(field.sampleHeight(20, -10)).toBe(3);
    expect(field.sampleHeight(24, -10)).toBe(3);
    expect(field.sampleHeight(20, -17)).toBe(3);

    expect(field.sampleHeight(60, 60)).toBe(unflattened.sampleHeight(60, 60));

    const ringSamples = [9, 11, 13, 14].map((distance) => field.sampleHeight(20 + distance, -10));
    for (let index = 1; index < ringSamples.length; index += 1) {
      const previous = ringSamples[index - 1]!;
      const current = ringSamples[index]!;
      const previousDelta = Math.abs(previous - 3);
      const currentDelta = Math.abs(current - 3);
      expect(currentDelta).toBeGreaterThanOrEqual(previousDelta - 1e-9);
    }
    expect(field.sampleHeight(20 + 14, -10)).toBeCloseTo(unflattened.sampleHeight(20 + 14, -10), 6);
  });

  test("resolveTerrainField flatten mask defaults its target to the noise height at center", () => {
    const seeded = terrain({ height: 5, seed: "flatten-default", frequency: 0.04 });
    const withoutMask = resolveTerrainField(seeded);
    const targetHeight = withoutMask.sampleHeight(0, 0);

    const masked = resolveTerrainField(
      terrain({ height: 5, seed: "flatten-default", frequency: 0.04, flatten: [{ center: [0, 0], radius: 5 }] }),
    );
    expect(masked.sampleHeight(0, 0)).toBeCloseTo(targetHeight, 6);
    expect(masked.sampleHeight(1, 1)).toBeCloseTo(targetHeight, 6);
  });

  test("fractalNoise averages toward zero over a wide sample", () => {
    let sum = 0;
    const config = { seed: 11, frequency: 0.05, octaves: 4, lacunarity: 2, persistence: 0.5, ridged: false };
    for (let i = 0; i < 400; i += 1) sum += fractalNoise(i * 1.7, i * -0.9, config);
    expect(Math.abs(sum / 400)).toBeLessThan(0.15);
  });

  test("a game-supplied heightField replaces the noise and still takes flatten masks", () => {
    const banded = terrain({
      heightField: (x) => (x < 0 ? 2 : 10),
      waterLevel: 1,
      flatten: [{ center: [50, 0], radius: 5, height: 4 }],
    });
    const field = resolveTerrainField(banded);
    expect(field.sampleHeight(-20, 0)).toBe(2);
    expect(field.sampleHeight(20, 0)).toBe(10);
    expect(field.sampleHeight(50, 0)).toBe(4);
    expect(field.waterLevel).toBe(1);
    const world = environment({ terrain: banded });
    expect(groundFieldFor(world).sampleHeight(20, 0)).toBe(10);
  });

  test("heightMapField samples two distinct elevation grids differently", () => {
    const low = heightMapField({
      columns: 2,
      rows: 2,
      samples: [0, 0, 0, 0],
      bounds: { w: 10, d: 10 },
      heightScale: 5,
    });
    const high = heightMapField({
      columns: 2,
      rows: 2,
      samples: [1, 1, 1, 1],
      bounds: { w: 10, d: 10 },
      heightScale: 5,
    });
    expect(low.sampleHeight(0, 0)).toBe(0);
    expect(high.sampleHeight(0, 0)).toBe(5);
    expect(low.sampleHeight(0, 0)).not.toBe(high.sampleHeight(0, 0));
  });

  test("heightMapField bilinear-interpolates and accepts flatten via heightField", () => {
    const map = heightMapField({
      columns: 2,
      rows: 2,
      samples: [0, 10, 0, 10],
      bounds: { w: 10, d: 10 },
    });
    expect(map.sampleHeight(-5, 0)).toBeCloseTo(0, 5);
    expect(map.sampleHeight(5, 0)).toBeCloseTo(10, 5);
    expect(map.sampleHeight(0, 0)).toBeCloseTo(5, 5);

    const field = resolveTerrainField(
      terrain({
        heightField: map.sampleHeight,
        bounds: { w: 10, d: 10 },
        flatten: [{ center: [0, 0], radius: 1, height: 2 }],
      }),
    );
    expect(field.sampleHeight(0, 0)).toBe(2);
  });

  test("resolveTerrainField rejects unloadable heightMap URLs loudly", () => {
    expect(() => resolveTerrainField(terrain({ heightMap: "./height.png" }))).toThrow(
      /heightMap "\.\/height\.png" is not auto-loaded/,
    );
  });

  test("createTerrainPaletteSampler paints regions inside their radius and blends across falloff", () => {
    const sampler = createTerrainPaletteSampler({
      material: "grass",
      materialRegions: [{ center: [100, 0], radius: 10, material: "snow", falloff: 10 }],
    });
    const base = resolveTerrainPalette({ material: "grass" });
    const snow = resolveTerrainPalette({ material: "snow" });
    expect(sampler(0, 0)).toEqual(base);
    expect(sampler(100, 0)).toEqual(snow);
    const blended = sampler(115, 0);
    expect(blended.low).not.toBe(base.low);
    expect(blended.low).not.toBe(snow.low);
    expect(sampler(125, 0)).toEqual(base);
  });

  test("createTerrainPaletteSampler without regions is the flat base palette", () => {
    const sampler = createTerrainPaletteSampler({ colors: { low: "#112233", high: "#445566" } });
    expect(sampler(3, 4).low).toBe("#112233");
    expect(sampler(-90, 12).high).toBe("#445566");
  });

  test("sampleSlope on flatField is level: no downhill, zero steepness", () => {
    const slope = sampleSlope(flatField(), 5, -5);
    expect(slope.downhill).toEqual([0, 0]);
    expect(slope.steepness).toBe(0);
  });

  test("sampleSlope on a linear ramp points downhill toward -x with steepness ~1", () => {
    const field = resolveTerrainField(terrain({ heightField: (x) => x }));
    const slope = sampleSlope(field, 10, 3);
    expect(slope.downhill[0]).toBeCloseTo(-1, 6);
    expect(slope.downhill[1]).toBeCloseTo(0, 6);
    expect(slope.steepness).toBeCloseTo(1, 6);
  });

  test("slopeForce points downhill and scales linearly with the scale argument", () => {
    const field = resolveTerrainField(terrain({ heightField: (x) => x }));
    const slope = sampleSlope(field, 10, 3);
    const force1 = slopeForce(field, 10, 3, 1);
    const force2 = slopeForce(field, 10, 3, 2);
    const magnitude1 = Math.hypot(force1[0], force1[1]);
    expect(force1[0] / magnitude1).toBeCloseTo(slope.downhill[0], 6);
    expect(force1[1] / magnitude1).toBeCloseTo(slope.downhill[1], 6);
    expect(force2[0]).toBeCloseTo(force1[0] * 2, 6);
    expect(force2[1]).toBeCloseTo(force1[1] * 2, 6);
  });

  test("composeIslandFields answers each island's local height inside its rect", () => {
    const islandA = island({ origin: [100, 0], bounds: { w: 40, d: 40 }, heightField: () => 5 });
    const islandB = island({ origin: [-100, 0], bounds: { w: 40, d: 40 }, heightField: () => 9 });
    const composed = composeIslandFields(null, [islandA, islandB]);
    expect(composed.sampleHeight(100, 0)).toBe(5);
    expect(composed.sampleHeight(-100, 0)).toBe(9);
  });

  test("composeIslandFields falls back to base terrain outside islands, or the void with no base", () => {
    const isle = island({ origin: [100, 0], bounds: { w: 20, d: 20 }, heightField: () => 5 });
    const base = flatField();
    const withBase = composeIslandFields(base, [isle]);
    expect(withBase.sampleHeight(0, 0)).toBe(0);

    const withoutBase = composeIslandFields(null, [isle]);
    expect(withoutBase.sampleHeight(0, 0)).toBe(ISLAND_VOID_HEIGHT);
  });

  test("composeIslandFields resolves overlaps in favor of the later island", () => {
    const first = island({ origin: [0, 0], bounds: { w: 40, d: 40 }, heightField: () => 1 });
    const second = island({ origin: [10, 0], bounds: { w: 40, d: 40 }, heightField: () => 2 });
    const composed = composeIslandFields(null, [first, second]);
    expect(composed.sampleHeight(5, 0)).toBe(2);
  });

  test("resolveEnvironmentField and groundFieldFor agree on a terrain+islands world", () => {
    const isle = island({ origin: [50, 50], bounds: { w: 30, d: 30 }, heightField: () => 7 });
    const world = environment({ terrain: terrain({ height: 0 }), islands: [isle] });
    const resolved = resolveEnvironmentField(world);
    const ground = groundFieldFor(world);
    for (const [x, z] of [[0, 0], [50, 50], [60, 55]] as const) {
      expect(ground.sampleHeight(x, z)).toBe(resolved.sampleHeight(x, z));
    }
    expect(resolved.sampleHeight(50, 50)).toBe(7);
    expect(resolved.sampleHeight(0, 0)).toBe(0);
  });
});
