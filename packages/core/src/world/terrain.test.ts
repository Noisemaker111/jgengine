import { describe, expect, test } from "bun:test";

import { environment, terrain } from "./features";
import {
  arenaField,
  fractalNoise,
  flatField,
  groundFieldFor,
  noiseField,
  resolveGroundStep,
  resolveTerrainField,
  resolveTerrainPalette,
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
    expect(resolveTerrainPalette({ material: "ash", colors: { low: "#000000" } })).toEqual({
      low: "#000000",
      high: TERRAIN_MATERIAL_PALETTES.ash.high,
      waterline: TERRAIN_MATERIAL_PALETTES.ash.waterline,
    });
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
});
