import { describe, expect, test } from "bun:test";

import {
  bakeIrradianceVolume,
  PROBE_STRIDE,
  probePosition,
  radianceAlong,
  sampleIrradianceVolume,
  shDirection,
  SH_COEFFICIENTS,
  type IrradianceVolume,
} from "./lightProbes";

const volume = (overrides: Partial<IrradianceVolume> = {}): IrradianceVolume => ({
  id: "room",
  center: [0, 2, 0],
  size: [8, 4, 8],
  resolution: [2, 2, 2],
  ...overrides,
});

const sphere = (count: number): [number, number, number][] =>
  Array.from({ length: count }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = index * 2.399963229728653;
    return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
  });

describe("shDirection", () => {
  test("the nine basis functions are orthonormal over the sphere", () => {
    const directions = sphere(4096);
    const basis = new Float64Array(SH_COEFFICIENTS);
    const products = new Float64Array(SH_COEFFICIENTS * SH_COEFFICIENTS);
    for (const [x, y, z] of directions) {
      shDirection(x, y, z, basis);
      for (let i = 0; i < SH_COEFFICIENTS; i += 1) {
        for (let j = 0; j < SH_COEFFICIENTS; j += 1) products[i * SH_COEFFICIENTS + j] += basis[i]! * basis[j]!;
      }
    }
    const scale = (4 * Math.PI) / directions.length;
    for (let i = 0; i < SH_COEFFICIENTS; i += 1) {
      for (let j = 0; j < SH_COEFFICIENTS; j += 1) {
        const value = products[i * SH_COEFFICIENTS + j]! * scale;
        expect(Math.abs(value - (i === j ? 1 : 0))).toBeLessThan(0.02);
      }
    }
  });

  test("band 0 is the constant term and the first band tracks y and x", () => {
    const basis = new Float64Array(SH_COEFFICIENTS);
    shDirection(0, 1, 0, basis);
    expect(basis[0]).toBeCloseTo(0.282095, 6);
    expect(basis[1]).toBeGreaterThan(0);
    shDirection(1, 0, 0, basis);
    expect(basis[3]).toBeGreaterThan(0);
  });
});

describe("probePosition", () => {
  test("spans the box, corners on its faces", () => {
    expect(probePosition(volume(), 0, 0, 0)).toEqual([-4, 0, -4]);
    expect(probePosition(volume(), 1, 1, 1)).toEqual([4, 4, 4]);
  });

  test("a one-probe axis sits at the centre", () => {
    expect(probePosition(volume({ resolution: [1, 1, 1] }), 0, 0, 0)).toEqual([0, 2, 0]);
  });
});

describe("bakeIrradianceVolume", () => {
  test("an open volume bakes brighter sky than ground", () => {
    const baked = bakeIrradianceVolume({
      id: "open",
      center: [0, 20, 0],
      size: [10, 10, 10],
      resolution: [1, 1, 1],
      settings: { skyVisibility: 1, skyColor: "#a8d4ff", groundColor: "#2a2620" },
    });
    expect(baked.samples?.length).toBe(PROBE_STRIDE);
    const up = radianceAlong(baked.samples!, [0, 1, 0]);
    const down = radianceAlong(baked.samples!, [0, -1, 0]);
    expect(up[2]).toBeGreaterThan(down[2]);
    expect(up[0] + up[1] + up[2]).toBeGreaterThan(down[0] + down[1] + down[2] + 0.4);
  });

  test("an enclosed volume keeps its authored fill instead of baking black", () => {
    const baked = bakeIrradianceVolume({
      id: "room",
      center: [0, 2, 0],
      size: [8, 4, 8],
      resolution: [1, 1, 1],
      settings: { skyVisibility: 0, ceilingColor: "#d8d2c4", floorColor: "#4a4438", fillIntensity: 0.8 },
    });
    const ceiling = radianceAlong(baked.samples!, [0, 1, 0]);
    const floor = radianceAlong(baked.samples!, [0, -1, 0]);
    expect(ceiling[0] + ceiling[1] + ceiling[2]).toBeGreaterThan(0.2);
    expect(ceiling[0]).toBeGreaterThan(floor[0]);
  });

  test("authored lamps brighten their side of the probe and fade with distance", () => {
    const near = bakeIrradianceVolume({
      id: "near",
      center: [0, 2, 0],
      size: [4, 4, 4],
      resolution: [1, 1, 1],
      settings: { skyVisibility: 0, fillIntensity: 0, lights: [{ position: [0, 4, 0], intensity: 8, color: "#ffd6a0" }] },
    });
    const far = bakeIrradianceVolume({
      id: "far",
      center: [0, 2, 0],
      size: [4, 4, 4],
      resolution: [1, 1, 1],
      settings: { skyVisibility: 0, fillIntensity: 0, lights: [{ position: [0, 40, 0], intensity: 8, color: "#ffd6a0" }] },
    });
    const litNear = radianceAlong(near.samples!, [0, 1, 0])[0];
    const litFar = radianceAlong(far.samples!, [0, 1, 0])[0];
    expect(litNear).toBeGreaterThan(0.05);
    expect(litNear).toBeGreaterThan(litFar * 4);
  });

  test("the bake is deterministic and resolution-correct", () => {
    const input = { id: "grid", center: [0, 0, 0], size: [6, 2, 4], resolution: [3, 2, 2], settings: { skyVisibility: 0.5 } } as const;
    const first = bakeIrradianceVolume({ ...input, resolution: [...input.resolution] });
    const second = bakeIrradianceVolume({ ...input, resolution: [...input.resolution] });
    expect(first.samples).toEqual(second.samples);
    expect(first.samples?.length).toBe(PROBE_STRIDE * 3 * 2 * 2);
  });
});

describe("sampleIrradianceVolume", () => {
  const uniform = (): IrradianceVolume => {
    const samples = new Array<number>(PROBE_STRIDE * 8).fill(0);
    for (let probe = 0; probe < 8; probe += 1) samples[probe * PROBE_STRIDE] = 1;
    return volume({ samples });
  };

  test("a uniform field reads the same everywhere, including outside the grid", () => {
    const out = new Float32Array(PROBE_STRIDE);
    expect(sampleIrradianceVolume(uniform(), [0, 2, 0], out)).toBe(true);
    expect(out[0]).toBeCloseTo(1, 6);
    expect(sampleIrradianceVolume(uniform(), [500, -500, 42], out)).toBe(true);
    expect(out[0]).toBeCloseTo(1, 6);
  });

  test("interpolates between probes instead of snapping to the nearest", () => {
    const samples = new Array<number>(PROBE_STRIDE * 2).fill(0);
    samples[0] = 0;
    samples[PROBE_STRIDE] = 10;
    const gradient = volume({ resolution: [2, 1, 1], samples });
    const out = new Float32Array(PROBE_STRIDE);
    sampleIrradianceVolume(gradient, [-4, 2, 0], out);
    expect(out[0]).toBeCloseTo(0, 5);
    sampleIrradianceVolume(gradient, [4, 2, 0], out);
    expect(out[0]).toBeCloseTo(10, 5);
    sampleIrradianceVolume(gradient, [0, 2, 0], out);
    expect(out[0]).toBeCloseTo(5, 5);
  });

  test("an unbaked volume reports no samples", () => {
    expect(sampleIrradianceVolume(volume(), [0, 2, 0], new Float32Array(PROBE_STRIDE))).toBe(false);
  });
});
