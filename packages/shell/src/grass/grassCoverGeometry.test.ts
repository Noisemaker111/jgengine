import { describe, expect, test } from "bun:test";

import { createGrassCoverGeometry, GRASS_COVER_MAX_SEGMENTS, GRASS_COVER_TILE_METRES } from "./grassCoverGeometry";

const base = {
  area: [20, 12] as const,
  seed: 7,
  colorBase: "#53734a",
  colorTip: "#819064",
  strength: 0.9,
  edgeFeather: 2,
  heightAt: (x: number) => 1.2 + x * 0.05,
  coverageAt: () => 1,
};

describe("grass cover geometry", () => {
  test("drapes every vertex on the runtime ground inside the authored footprint", () => {
    const cover = createGrassCoverGeometry(base);
    expect(cover.positions.length).toBeGreaterThan(0);
    expect(cover.indices.length % 6).toBe(0);
    for (let i = 0; i < cover.positions.length; i += 3) {
      const x = cover.positions[i]!;
      const y = cover.positions[i + 1]!;
      const z = cover.positions[i + 2]!;
      expect(Math.abs(x)).toBeLessThanOrEqual(10 + 1e-6);
      expect(Math.abs(z)).toBeLessThanOrEqual(6 + 1e-6);
      expect(y).toBeCloseTo(1.2 + x * 0.05 + 0.035, 5);
      expect(Math.hypot(cover.uvs[(i / 3) * 2]! * GRASS_COVER_TILE_METRES - x, cover.uvs[(i / 3) * 2 + 1]! * GRASS_COVER_TILE_METRES - z)).toBeLessThan(1e-6);
    }
  });

  test("fades to zero alpha at the edge and keeps the middle opaque", () => {
    const cover = createGrassCoverGeometry(base);
    const segments = Math.round(Math.sqrt(cover.colors.length / 4)) - 1;
    const cols = segments + 1;
    const alphaAt = (ix: number, iz: number) => cover.colors[(iz * cols + ix) * 4 + 3]!;
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(segments, segments)).toBe(0);
    expect(alphaAt(Math.round(segments / 2), Math.round(segments / 2))).toBeGreaterThan(0.6);
  });

  test("authored clearance masks punch cover back out and strength 0 bakes nothing", () => {
    const masked = createGrassCoverGeometry({ ...base, coverageAt: (x) => (x > 0 ? 0 : 1) });
    const segments = Math.round(Math.sqrt(masked.colors.length / 4)) - 1;
    const cols = segments + 1;
    const alphaAt = (ix: number, iz: number) => masked.colors[(iz * cols + ix) * 4 + 3]!;
    expect(alphaAt(cols - 1, Math.round(segments / 2))).toBe(0);
    expect(alphaAt(1, Math.round(segments / 2))).toBeGreaterThan(0);
    expect(createGrassCoverGeometry({ ...base, strength: 0 }).positions.length).toBe(0);
  });

  test("bounds the grid for a large park", () => {
    const cover = createGrassCoverGeometry({ ...base, area: [400, 400] });
    const cols = Math.round(Math.sqrt(cover.positions.length / 3));
    expect(cols).toBe(GRASS_COVER_MAX_SEGMENTS + 1);
  });
});
