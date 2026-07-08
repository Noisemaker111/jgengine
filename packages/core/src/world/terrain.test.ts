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
  TERRAIN_MATERIAL_PALETTES,
  valueNoise,
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

  test("fractalNoise averages toward zero over a wide sample", () => {
    let sum = 0;
    const config = { seed: 11, frequency: 0.05, octaves: 4, lacunarity: 2, persistence: 0.5, ridged: false };
    for (let i = 0; i < 400; i += 1) sum += fractalNoise(i * 1.7, i * -0.9, config);
    expect(Math.abs(sum / 400)).toBeLessThan(0.15);
  });
});
