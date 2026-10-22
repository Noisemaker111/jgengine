import { describe, expect, test } from "bun:test";

import { createDecalDrapeGeometry } from "./decalGeometry";
import { createDecalTexture } from "./decalTexture";

function alphaStats(data: Uint8Array): { covered: number; opaque: number } {
  let covered = 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 8) covered += 1;
    if (data[i]! > 200) opaque += 1;
  }
  return { covered, opaque };
}

describe("decal textures", () => {
  test("every style bakes deterministic coverage with empty corners", () => {
    for (const style of ["dirt", "cracks", "paint", "blood"] as const) {
      const first = createDecalTexture(style, "wall");
      const second = createDecalTexture(style, "wall");
      expect(Array.from(first.data)).toEqual(Array.from(second.data));
      const stats = alphaStats(first.data);
      expect(stats.covered).toBeGreaterThan(first.size * first.size * 0.05);
      expect(stats.opaque).toBeLessThan(first.size * first.size * 0.9);
      const corner = first.data[3]!;
      expect(corner).toBe(0);
    }
  });

  test("the seed changes the shape and each style looks its own colour", () => {
    const dirt = createDecalTexture("dirt", "a");
    const dirtB = createDecalTexture("dirt", "b");
    expect(Array.from(dirt.data)).not.toEqual(Array.from(dirtB.data));
    const blood = createDecalTexture("blood", "a");
    const paint = createDecalTexture("paint", "a");
    const bloodPixel = blood.data.findIndex((_, index) => index % 4 === 3 && blood.data[index]! > 200);
    const paintPixel = paint.data.findIndex((_, index) => index % 4 === 3 && paint.data[index]! > 200);
    expect(blood.data[bloodPixel - 3]!).toBeGreaterThan(blood.data[bloodPixel - 1]!);
    expect(paint.data[paintPixel - 3]!).toBeGreaterThan(paint.data[paintPixel - 2]!);
    expect(dirt.data[bloodPixel]).not.toBe(blood.data[bloodPixel]);
  });
});

describe("decal drape geometry", () => {
  test("rotates the patch and follows the terrain height under every vertex", () => {
    const geometry = createDecalDrapeGeometry({
      size: 4,
      rotationY: Math.PI / 2,
      heightAt: (x, z) => 1 + z * 0.1 + x * 0.05,
      lift: 0.03,
      segments: 8,
    });
    for (let i = 0; i < geometry.positions.length; i += 3) {
      const x = geometry.positions[i]!;
      const y = geometry.positions[i + 1]!;
      const z = geometry.positions[i + 2]!;
      expect(Math.abs(x)).toBeLessThanOrEqual(2 + 1e-6);
      expect(Math.abs(z)).toBeLessThanOrEqual(2 + 1e-6);
      expect(y).toBeCloseTo(1 + z * 0.1 + x * 0.05 + 0.03, 5);
    }
    expect(geometry.indices.length).toBe(8 * 8 * 6);
  });
});
