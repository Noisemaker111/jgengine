import { describe, expect, test } from "bun:test";

import { createGrassBladeGeometry } from "./grassGeometry";
import { createSeededRandom } from "./random";
import { createProceduralGroundGeometry, createProceduralTerrainSampler } from "./terrainMath";

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
