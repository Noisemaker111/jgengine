import { describe, expect, test } from "bun:test";

import { CarvableField, carvableTerrain, EMPTY_VOXEL, VoxelVolume, type VoxelMaterialTable } from "./carve";
import { flatField, noiseField } from "./terrain";

describe("VoxelVolume", () => {
  test("starts solid and carve clears a sphere of cells", () => {
    const v = new VoxelVolume({ dims: [16, 16, 16], fill: 1 });
    expect(v.solid).toBe(16 * 16 * 16);
    const removed = v.carve({ center: [8, 8, 8], radius: 3 });
    expect(removed).toBeGreaterThan(0);
    expect(v.solid).toBe(16 * 16 * 16 - removed);
    expect(v.solidAtWorld(8, 8, 8)).toBe(false);
    expect(v.solidAtWorld(0.5, 0.5, 0.5)).toBe(true);
  });

  test("deposit fills empty cells back in", () => {
    const v = new VoxelVolume({ dims: [16, 16, 16], fill: EMPTY_VOXEL });
    expect(v.solid).toBe(0);
    const filled = v.deposit({ center: [8, 8, 8], radius: 2, material: 3 });
    expect(filled).toBeGreaterThan(0);
    expect(v.solid).toBe(filled);
    expect(v.get(8, 8, 8)).toBe(3);
  });

  test("tool strength gates which materials a carve can remove", () => {
    const materials: VoxelMaterialTable = {
      1: { id: 1, name: "dirt", strength: 1 },
      2: { id: 2, name: "granite", strength: 9 },
    };
    const v = new VoxelVolume({ dims: [8, 8, 8], fill: 2, materials });
    const weak = v.carve({ center: [4, 4, 4], radius: 3, toolStrength: 3 });
    expect(weak).toBe(0);
    expect(v.solid).toBe(8 * 8 * 8);
    const strong = v.carve({ center: [4, 4, 4], radius: 3, toolStrength: 10 });
    expect(strong).toBeGreaterThan(0);
  });

  test("origin and scale map world coordinates to cells", () => {
    const v = new VoxelVolume({ dims: [4, 4, 4], origin: [100, 0, 100], scale: 2, fill: 1 });
    expect(v.worldToCell(101, 1, 101)).toEqual([0, 0, 0]);
    expect(v.worldToCell(107, 1, 107)).toEqual([3, 0, 3]);
    v.carve({ center: [101, 1, 101], radius: 1 });
    expect(v.get(0, 0, 0)).toBe(EMPTY_VOXEL);
  });
});

describe("CarvableField", () => {
  test("a crater writes back into sampleHeight", () => {
    const field = carvableTerrain(flatField());
    expect(field.sampleHeight(0, 0)).toBe(0);
    field.carve({ x: 0, z: 0, radius: 5, depth: 4 });
    expect(field.editCount).toBe(1);
    expect(field.sampleHeight(0, 0)).toBeCloseTo(-4, 5);
    expect(field.sampleHeight(10, 0)).toBe(0);
    expect(field.sampleHeight(2, 0)).toBeLessThan(0);
    expect(field.sampleHeight(2, 0)).toBeGreaterThan(-4);
  });

  test("a deposit raises a mound and normals tilt around the rim", () => {
    const field = carvableTerrain(flatField());
    field.deposit({ x: 0, z: 0, radius: 5, height: 3 });
    expect(field.sampleHeight(0, 0)).toBeCloseTo(3, 5);
    const normal = field.sampleNormal(3, 0);
    expect(normal[0]).not.toBe(0);
    expect(normal[1]).toBeGreaterThan(0);
  });

  test("preserves the base field's bounds and water level and layers over noise", () => {
    const base = noiseField({ seed: "crater", amplitude: 2, waterLevel: -1, bounds: { w: 64, d: 64 } });
    const field = new CarvableField(base);
    expect(field.waterLevel).toBe(-1);
    expect(field.bounds).toEqual({ w: 64, d: 64 });
    const before = field.sampleHeight(4, 4);
    field.carve({ x: 4, z: 4, radius: 3, depth: 5 });
    expect(field.sampleHeight(4, 4)).toBeCloseTo(before - 5, 4);
  });
});
