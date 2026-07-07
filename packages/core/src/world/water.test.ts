import { describe, expect, test } from "bun:test";
import type { OceanEnvironmentDescriptor } from "./features";
import {
  synthesizeWaves,
  waterSurface,
  waterSurfaceFromDescriptor,
  type GerstnerWave,
} from "./water";

function amplitudeTotal(waves: readonly GerstnerWave[]): number {
  return waves.reduce((sum, wave) => sum + wave.amplitude, 0);
}

describe("synthesizeWaves", () => {
  test("amplitudes sum to the wave height budget", () => {
    const waves = synthesizeWaves({ waveHeight: 2.5, waves: 5 });
    expect(amplitudeTotal(waves)).toBeCloseTo(2.5, 6);
  });

  test("all directions are unit length", () => {
    const waves = synthesizeWaves({ waves: 6 });
    for (const wave of waves) {
      const [dx, dz] = wave.direction;
      expect(Math.hypot(dx, dz)).toBeCloseTo(1, 12);
    }
  });

  test("steepness stays within [0,1]", () => {
    const waves = synthesizeWaves({ waveHeight: 5, waveScale: 3, waves: 8 });
    for (const wave of waves) {
      expect(wave.steepness).toBeGreaterThanOrEqual(0);
      expect(wave.steepness).toBeLessThanOrEqual(1);
    }
  });

  test("flat request produces no waves", () => {
    expect(synthesizeWaves({ waveHeight: 0 })).toHaveLength(0);
    expect(synthesizeWaves({ waves: 0 })).toHaveLength(0);
  });
});

describe("waterSurface", () => {
  test("is deterministic for identical inputs", () => {
    const a = waterSurface({ waveHeight: 1.3, waveScale: 20, waveSpeed: 0.6 });
    const b = waterSurface({ waveHeight: 1.3, waveScale: 20, waveSpeed: 0.6 });
    for (let i = 0; i < 20; i += 1) {
      const x = i * 3.1;
      const z = i * -1.7;
      const t = i * 0.37;
      expect(a.height(x, z, t)).toBe(b.height(x, z, t));
      expect(a.displace(x, z, t)).toEqual(b.displace(x, z, t));
      expect(a.normal(x, z, t)).toEqual(b.normal(x, z, t));
    }
  });

  test("height oscillates around the resting level", () => {
    const level = 4;
    const surface = waterSurface({ level, waveHeight: 2, waveScale: 12 });
    let sum = 0;
    let samples = 0;
    for (let ix = 0; ix < 24; ix += 1) {
      for (let iz = 0; iz < 24; iz += 1) {
        const t = (ix + iz) * 0.13;
        sum += surface.height(ix * 2.3 - 27, iz * 1.9 - 22, t);
        samples += 1;
      }
    }
    expect(sum / samples).toBeCloseTo(level, 1);
  });

  test("normals are unit length with positive y", () => {
    const surface = waterSurface({ waveHeight: 1.8, waveScale: 9, waves: 5 });
    for (let i = 0; i < 40; i += 1) {
      const [nx, ny, nz] = surface.normal(i * 2.7 - 13, i * -3.3 + 5, i * 0.21);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 10);
      expect(ny).toBeGreaterThan(0);
    }
  });

  test("flat water is exactly level with an up normal", () => {
    const surface = waterSurface({ level: 2.5, waveHeight: 0 });
    expect(surface.waves).toHaveLength(0);
    for (let i = 0; i < 10; i += 1) {
      const x = i * 5;
      const z = i * -4;
      const t = i * 0.9;
      expect(surface.height(x, z, t)).toBe(2.5);
      expect(surface.normal(x, z, t)).toEqual([0, 1, 0]);
      expect(surface.displace(x, z, t)).toEqual([x, 2.5, z]);
    }
  });
});

describe("waterSurfaceFromDescriptor", () => {
  test("maps descriptor level and wave height", () => {
    const descriptor: OceanEnvironmentDescriptor = {
      kind: "ocean",
      bounds: { w: 1024, d: 1024 },
      level: 7,
      waveHeight: 3,
      waveScale: 22,
      waveSpeed: 0.7,
      color: "#1d7fa3",
    };
    const surface = waterSurfaceFromDescriptor(descriptor);
    expect(surface.level).toBe(7);
    expect(amplitudeTotal(surface.waves)).toBeCloseTo(3, 6);
  });

  test("respects an explicit wave count override", () => {
    const descriptor: OceanEnvironmentDescriptor = {
      kind: "ocean",
      bounds: { w: 512, d: 512 },
      level: 0,
      waveHeight: 1.2,
      waveScale: 18,
      waveSpeed: 0.55,
      color: "#1d7fa3",
    };
    expect(waterSurfaceFromDescriptor(descriptor, 3).waves).toHaveLength(3);
  });
});
