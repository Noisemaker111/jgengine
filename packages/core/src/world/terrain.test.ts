import { describe, expect, test } from "bun:test";

import type { TerrainMaterialMaps } from "./features";
import { environment, island, terrain } from "./features";
import {
  arenaField,
  composeIslandFields,
  createBiomeBandSampler,
  createBiomeFogSampler,
  createBiomeSkySampler,
  createTerrainPaletteSampler,
  fractalNoise,
  flatField,
  groundFieldFor,
  heightMapField,
  ISLAND_VOID_HEIGHT,
  noiseField,
  raycastHeightField,
  resolveEnvironmentField,
  resolveGroundStep,
  resolveTerrainDetail,
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

  test("createTerrainPaletteSampler paints a polyline ribbon along its centerline", () => {
    const sampler = createTerrainPaletteSampler({
      material: "grass",
      materialRegions: [
        {
          shape: "polyline",
          points: [
            [0, 0],
            [100, 0],
          ],
          width: 20,
          material: "slate",
          falloff: 10,
        },
      ],
    });
    const base = resolveTerrainPalette({ material: "grass" });
    const slate = resolveTerrainPalette({ material: "slate" });
    expect(sampler(50, 0)).toEqual(slate);
    expect(sampler(50, 9)).toEqual(slate);
    expect(sampler(50, 40)).toEqual(base);
    const blended = sampler(50, 15);
    expect(blended.low).not.toBe(base.low);
    expect(blended.low).not.toBe(slate.low);
  });

  test("createTerrainPaletteSampler paints a rect district and blends outside it", () => {
    const sampler = createTerrainPaletteSampler({
      material: "grass",
      materialRegions: [{ shape: "rect", center: [0, 0], halfExtents: [30, 10], material: "sand", falloff: 5 }],
    });
    const base = resolveTerrainPalette({ material: "grass" });
    const sand = resolveTerrainPalette({ material: "sand" });
    expect(sampler(0, 0)).toEqual(sand);
    expect(sampler(29, 9)).toEqual(sand);
    expect(sampler(100, 0)).toEqual(base);
  });

  test("a rotated rect covers along its local axis", () => {
    const sampler = createTerrainPaletteSampler({
      material: "grass",
      materialRegions: [
        { shape: "rect", center: [0, 0], halfExtents: [30, 5], rotationY: Math.PI / 2, material: "sand" },
      ],
    });
    const sand = resolveTerrainPalette({ material: "sand" });
    expect(sampler(0, 25)).toEqual(sand);
  });

  test("createBiomeBandSampler clamps outside the band range and cross-fades across boundaries", () => {
    const vale = resolveTerrainPalette({ colors: { low: "#204010", high: "#3a6020" } });
    const peaks = resolveTerrainPalette({ colors: { low: "#7a8878", high: "#aab4a0" } });
    const sampler = createBiomeBandSampler(
      [
        { z: -100, fade: 40, colors: { low: "#204010", high: "#3a6020" } },
        { z: 100, fade: 40, colors: { low: "#7a8878", high: "#aab4a0" } },
      ],
      resolveTerrainPalette({ material: "grass" }),
    );
    expect(sampler(-200)).toEqual(vale);
    expect(sampler(200)).toEqual(peaks);
    expect(sampler(-100)).toEqual(vale);
    expect(sampler(100)).toEqual(peaks);
    const midpoint = sampler(0);
    expect(midpoint.low).not.toBe(vale.low);
    expect(midpoint.low).not.toBe(peaks.low);
    expect(sampler(-30)).toEqual(vale);
    expect(sampler(30)).toEqual(peaks);
  });

  test("createBiomeBandSampler with no bands is the fallback palette", () => {
    const fallback = resolveTerrainPalette({ material: "grass" });
    expect(createBiomeBandSampler([], fallback)(42)).toEqual(fallback);
  });

  test("createBiomeFogSampler cross-fades and clamps between adjacent bands", () => {
    const fallback = { color: "#000000", near: 70, far: 260, density: 0 };
    const sampler = createBiomeFogSampler(
      [
        { z: -100, fade: 40, fog: { color: "#ff0000", near: 10, far: 100 } },
        { z: 100, fade: 40, fog: { color: "#0000ff", near: 30, far: 300 } },
      ],
      fallback,
    );
    expect(sampler(-200)).toEqual({ color: "#ff0000", near: 10, far: 100, density: 0 });
    expect(sampler(200)).toEqual({ color: "#0000ff", near: 30, far: 300, density: 0 });
    expect(sampler(-30)).toEqual({ color: "#ff0000", near: 10, far: 100, density: 0 });
    const mid = sampler(0);
    expect(mid.color).not.toBe("#ff0000");
    expect(mid.color).not.toBe("#0000ff");
    expect(mid.near).toBeGreaterThan(10);
    expect(mid.near).toBeLessThan(30);
    expect(mid.far).toBeGreaterThan(100);
    expect(mid.far).toBeLessThan(300);
  });

  test("createBiomeFogSampler falls a band with no fog through to the fallback", () => {
    const fallback = { color: "#123456", near: 70, far: 260, density: 0 };
    const sampler = createBiomeFogSampler(
      [
        { z: -100, fog: { color: "#ff0000" } },
        { z: 100 },
      ],
      fallback,
    );
    expect(sampler(200)).toEqual(fallback);
    expect(sampler(-200).color).toBe("#ff0000");
    expect(sampler(-200).near).toBe(70);
  });

  test("createBiomeFogSampler with no bands is the fallback fog", () => {
    const fallback = { color: "#123456", near: 70, far: 260, density: 0.5 };
    expect(createBiomeFogSampler([], fallback)(42)).toEqual(fallback);
  });

  test("createBiomeSkySampler cross-fades and clamps between adjacent bands", () => {
    const fallback = { horizonColor: "#e3f4ff", zenithColor: "#3fa4f2", sunIntensity: 1, ambientIntensity: 0.6 };
    const sampler = createBiomeSkySampler(
      [
        { z: -100, fade: 40, sky: { horizonColor: "#ffcc88", zenithColor: "#204080", sunIntensity: 0.4, ambientIntensity: 0.3 } },
        { z: 100, fade: 40, sky: { horizonColor: "#ffffff", zenithColor: "#88bbff", sunIntensity: 1.2, ambientIntensity: 0.8 } },
      ],
      fallback,
    );
    expect(sampler(-200).zenithColor).toBe("#204080");
    expect(sampler(200).sunIntensity).toBe(1.2);
    const mid = sampler(0);
    expect(mid.sunIntensity).toBeGreaterThan(0.4);
    expect(mid.sunIntensity).toBeLessThan(1.2);
    expect(mid.zenithColor).not.toBe("#204080");
    expect(mid.zenithColor).not.toBe("#88bbff");
  });

  test("createBiomeSkySampler falls a band with no sky through to the fallback and has no-band fallback", () => {
    const fallback = { horizonColor: "#e3f4ff", zenithColor: "#3fa4f2", sunIntensity: 1, ambientIntensity: 0.6 };
    const sampler = createBiomeSkySampler([{ z: -100, sky: { sunIntensity: 0.2 } }, { z: 100 }], fallback);
    expect(sampler(200)).toEqual(fallback);
    expect(sampler(-200).sunIntensity).toBe(0.2);
    expect(sampler(-200).zenithColor).toBe("#3fa4f2");
    expect(createBiomeSkySampler([], fallback)(5)).toEqual(fallback);
  });

  test("createTerrainPaletteSampler layers materialRegions over biomeBands", () => {
    const sampler = createTerrainPaletteSampler({
      material: "grass",
      biomeBands: [
        { z: -100, colors: { low: "#204010", high: "#3a6020" } },
        { z: 100, colors: { low: "#7a8878", high: "#aab4a0" } },
      ],
      materialRegions: [{ center: [0, 100], radius: 10, material: "snow" }],
    });
    const peaks = resolveTerrainPalette({ colors: { low: "#7a8878", high: "#aab4a0" } });
    const snow = resolveTerrainPalette({ material: "snow" });
    expect(sampler(0, 100)).toEqual(snow);
    expect(sampler(300, 100)).toEqual(peaks);
    expect(sampler(0, -100)).toEqual(resolveTerrainPalette({ colors: { low: "#204010", high: "#3a6020" } }));
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

  test("resolveTerrainDetail leaves material undefined when no texture is configured", () => {
    const detail = resolveTerrainDetail({});
    expect(detail.material).toBeUndefined();
  });

  test("resolveTerrainDetail passes through material maps and fills repeat/strength defaults", () => {
    const maps: TerrainMaterialMaps = {
      color: "/materials/grass/color.jpg",
      normal: "/materials/grass/normal.jpg",
      roughness: "/materials/grass/roughness.jpg",
      ao: "/materials/grass/ao.jpg",
      displacement: "/materials/grass/displacement.jpg",
    };
    const detail = resolveTerrainDetail({ material: { maps } });
    expect(detail.material).toEqual({ maps, repeat: 4, strength: 1 });
  });

  test("resolveTerrainDetail honors explicit material repeat/strength overrides", () => {
    const maps: TerrainMaterialMaps = {
      color: "c",
      normal: "n",
      roughness: "r",
      ao: "a",
      displacement: "d",
    };
    const detail = resolveTerrainDetail({ material: { maps, repeat: 12, strength: 0.4 } });
    expect(detail.material).toEqual({ maps, repeat: 12, strength: 0.4 });
  });
});

describe("raycastHeightField", () => {
  const bounds = { minX: -50, minZ: -50, maxX: 50, maxZ: 50 };

  test("hits a flat field where the ray meets y=0", () => {
    const hit = raycastHeightField(() => 0, [0, 10, 0], [1, -1, 0], { bounds, step: 0.5 });
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(10, 1);
    expect(hit!.y).toBeCloseTo(0, 2);
    expect(hit!.z).toBeCloseTo(0, 2);
    expect(hit!.distance).toBeCloseTo(Math.hypot(10, 10), 1);
  });

  test("lands on a raised plateau instead of the ground plane behind it", () => {
    // 4-unit plateau for x >= 0: a downward ray from x<0 aimed across it must stop on top.
    const plateau = (x: number): number => (x >= 0 ? 4 : 0);
    const hit = raycastHeightField(plateau, [-10, 8, 0], [1, -0.25, 0], { bounds, step: 0.5 });
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeCloseTo(4, 1);
    expect(hit!.x).toBeGreaterThanOrEqual(0);
    // The straight ray would only reach y=4 at x=6; the surface stops it at the plateau edge first.
    expect(hit!.x).toBeLessThanOrEqual(6.1);
  });

  test("bisection converges: the hit's ray point sits on the surface within step/2^refine", () => {
    const rolling = (x: number, z: number): number => Math.sin(x * 0.2) * 3 + Math.cos(z * 0.15) * 2;
    const direction: [number, number, number] = [0.6, -0.5, 0.4];
    const origin: [number, number, number] = [-30, 25, -20];
    const hit = raycastHeightField(rolling, origin, direction, { bounds, step: 1 });
    expect(hit).not.toBeNull();
    // Reported y is the exact surface height under the crossing point.
    expect(hit!.y).toBeCloseTo(rolling(hit!.x, hit!.z), 6);
    // And the ray's own y at that distance agrees with the surface to bisection precision.
    const len = Math.hypot(...direction);
    const rayY = origin[1] + (direction[1] / len) * hit!.distance;
    expect(Math.abs(rayY - hit!.y)).toBeLessThan(0.05);
  });

  test("misses when the ray passes above the field inside bounds", () => {
    const hit = raycastHeightField(() => 0, [0, 10, 0], [1, 0.1, 0], { bounds, step: 0.5 });
    expect(hit).toBeNull();
  });

  test("misses when the ray never enters the XZ bounds", () => {
    const hit = raycastHeightField(() => 0, [200, 10, 200], [1, -1, 0], { bounds, step: 0.5 });
    expect(hit).toBeNull();
  });

  test("an origin below the surface hits immediately at the clip entry", () => {
    const hit = raycastHeightField(() => 5, [0, 0, 0], [1, 0, 0], { bounds, step: 0.5 });
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBe(0);
  });

  test("clips to bounds entry before sampling — origin outside, hit inside", () => {
    const hit = raycastHeightField(() => 1, [-100, 30, 0], [1, -0.25, 0], { bounds, step: 0.5 });
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(hit!.y).toBeCloseTo(1, 2);
  });

  test("respects maxDistance", () => {
    const hit = raycastHeightField(() => 0, [0, 10, 0], [1, -1, 0], { bounds, step: 0.5, maxDistance: 5 });
    expect(hit).toBeNull();
  });

  test("an upward ray inside bounds misses promptly instead of marching forever", () => {
    // Vertical-up: the XZ slab cannot clip it (t1 is unbounded); the step cap must end the march.
    const started = performance.now();
    const hit = raycastHeightField(() => 0, [0, 5, 0], [0, 1, 0], { bounds, step: 0.5 });
    expect(hit).toBeNull();
    expect(performance.now() - started).toBeLessThan(250);
  });

  test("a near-vertical miss is bounded by maxSteps instead of the enormous slab crossing", () => {
    // dx is tiny but nonzero: the slab crossing is ~1e12 units long; without a cap this stalls.
    const started = performance.now();
    const hit = raycastHeightField(() => -1000, [0, 5, 0], [1e-11, 1, 0], { bounds, step: 0.5 });
    expect(hit).toBeNull();
    expect(performance.now() - started).toBeLessThan(250);
  });

  test("a vertical ray straight down hits the field under it", () => {
    const rolling = (x: number, z: number): number => Math.sin(x) + Math.cos(z);
    const hit = raycastHeightField(rolling, [3, 20, -4], [0, -1, 0], { bounds, step: 0.5 });
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(3, 6);
    expect(hit!.z).toBeCloseTo(-4, 6);
    expect(hit!.y).toBeCloseTo(rolling(3, -4), 3);
  });
});
