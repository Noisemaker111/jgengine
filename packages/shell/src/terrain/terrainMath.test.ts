import { describe, expect, test } from "bun:test";

import { createGrassBladeGeometry } from "./grassGeometry";
import { createSeededRandom } from "./random";
import {
  createFieldGroundGeometry,
  createProceduralGroundGeometry,
  createProceduralTerrainSampler,
  normalizeHeightBlend,
} from "./terrainMath";

describe("terrain primitives", () => {
  test("seeded random streams are stable", () => {
    const a = createSeededRandom("field");
    const b = createSeededRandom("field");
    const c = createSeededRandom("other");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect([a(), a(), a()]).not.toEqual([c(), c(), c()]);
  });

  test("procedural terrain sampler is deterministic", () => {
    const a = createProceduralTerrainSampler({ seed: "ridge", height: 2 });
    const b = createProceduralTerrainSampler({ seed: "ridge", height: 2 });
    expect(a(3.25, -7.5)).toBeCloseTo(b(3.25, -7.5));
  });

  test("procedural ground geometry resolves vertex and index counts", () => {
    const geometry = createProceduralGroundGeometry({ size: [8, 4], segments: [4, 2], seed: 9 });
    expect(geometry.attributes.position.count).toBe(15);
    expect(geometry.index?.count).toBe(48);
    expect(geometry.attributes.normal.count).toBe(15);
    expect(geometry.attributes.color.count).toBe(15);
    geometry.dispose();
  });

  test("normalizeHeightBlend clamps normally and is finite when the range collapses", () => {
    expect(normalizeHeightBlend(1, 0, 2)).toBeCloseTo(0.5);
    expect(normalizeHeightBlend(-5, 0, 2)).toBe(0);
    expect(normalizeHeightBlend(5, 0, 2)).toBe(1);
    expect(normalizeHeightBlend(0, 0, 0)).toBe(0);
    expect(Number.isNaN(normalizeHeightBlend(0, 0, 0))).toBe(false);
  });

  test("flat terrain (height 0) yields finite vertex colors, not NaN", () => {
    const geometry = createProceduralGroundGeometry({ size: [8, 4], segments: [4, 2], seed: 9, height: 0 });
    const colors = geometry.attributes.color;
    for (let i = 0; i < colors.count; i += 1) {
      expect(Number.isFinite(colors.getX(i))).toBe(true);
      expect(Number.isFinite(colors.getY(i))).toBe(true);
      expect(Number.isFinite(colors.getZ(i))).toBe(true);
    }
    geometry.dispose();
  });

  test("field ground geometry with a collapsed heightRange yields finite vertex colors", () => {
    const geometry = createFieldGroundGeometry(
      { sampleHeight: () => 0, sampleNormal: () => [0, 1, 0] as const },
      { size: [8, 4], segments: [4, 2], heightRange: [0, 0] },
    );
    const colors = geometry.attributes.color;
    for (let i = 0; i < colors.count; i += 1) {
      expect(Number.isFinite(colors.getX(i))).toBe(true);
      expect(Number.isFinite(colors.getY(i))).toBe(true);
      expect(Number.isFinite(colors.getZ(i))).toBe(true);
    }
    geometry.dispose();
  });

  test("grass blade geometry places seeded instances on the provided surface", () => {
    const geometry = createGrassBladeGeometry({
      count: 12,
      area: [6, 4],
      seed: "grass",
      heightAt: (x, z) => x * 0.25 + z * 0.5,
    });
    const offsets = geometry.getAttribute("instanceOffset");
    expect(geometry.instanceCount).toBe(12);
    expect(offsets.count).toBe(12);
    for (let index = 0; index < offsets.count; index += 1) {
      expect(offsets.getY(index)).toBeCloseTo(offsets.getX(index) * 0.25 + offsets.getZ(index) * 0.5);
    }
    geometry.dispose();
  });
});
