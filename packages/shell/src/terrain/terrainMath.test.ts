import { describe, expect, test } from "bun:test";

import { terrain } from "@jgengine/core/world/features";
import {
  heightMapField,
  resolveTerrainField,
  resolveTerrainPalette,
  TERRAIN_MATERIAL_PALETTES,
} from "@jgengine/core/world/terrain";

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

  test("resolveTerrainPalette defaults to the grass preset", () => {
    expect(resolveTerrainPalette()).toEqual(TERRAIN_MATERIAL_PALETTES.grass);
    expect(resolveTerrainPalette({})).toEqual(TERRAIN_MATERIAL_PALETTES.grass);
  });

  test("resolveTerrainPalette resolves a named material preset", () => {
    expect(resolveTerrainPalette({ material: "sand" })).toEqual(TERRAIN_MATERIAL_PALETTES.sand);
    expect(resolveTerrainPalette({ material: "snow" })).toEqual(TERRAIN_MATERIAL_PALETTES.snow);
  });

  test("resolveTerrainPalette lets explicit colors override the preset field-by-field", () => {
    expect(resolveTerrainPalette({ material: "rock", colors: { high: "#ffcc00" } })).toEqual({
      low: TERRAIN_MATERIAL_PALETTES.rock.low,
      high: "#ffcc00",
      waterline: TERRAIN_MATERIAL_PALETTES.rock.waterline,
    });
    expect(resolveTerrainPalette({ colors: { low: "#111111", high: "#222222", waterline: "#333333" } })).toEqual({
      low: "#111111",
      high: "#222222",
      waterline: "#333333",
    });
  });

  test("segments passed through to the procedural ground geometry", () => {
    const geometry = createProceduralGroundGeometry({ size: [8, 4], segments: [2, 1], seed: 9 });
    expect(geometry.attributes.position.count).toBe(6);
    geometry.dispose();
  });

  test("normalizeHeightBlend clamps normally and is finite when the range collapses", () => {
    expect(normalizeHeightBlend(1, 0, 2)).toBeCloseTo(0.5);
    expect(normalizeHeightBlend(-5, 0, 2)).toBe(0);
    expect(normalizeHeightBlend(5, 0, 2)).toBe(1);
    expect(normalizeHeightBlend(0, 0, 0)).toBe(0.5);
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

  test("grass blade geometry places seeded tuft instances on the provided surface", () => {
    const geometry = createGrassBladeGeometry({
      count: 12,
      area: [6, 4],
      seed: "grass",
      tuftBlades: 4,
      edgeFeather: 0,
      heightAt: (x, z) => x * 0.25 + z * 0.5,
    });
    // 12 blades at 4 blades per tuft → 3 tuft instances, each template carrying 4 blades.
    const offsets = geometry.getAttribute("instanceOffset");
    expect(geometry.instanceCount).toBe(3);
    expect(offsets.count).toBe(3);
    const vertsPerBlade = geometry.getAttribute("position").count / 4;
    expect(vertsPerBlade).toBe((4 + 1) * 2);
    for (let index = 0; index < offsets.count; index += 1) {
      expect(offsets.getY(index)).toBeCloseTo(offsets.getX(index) * 0.25 + offsets.getZ(index) * 0.5);
    }
    geometry.dispose();
  });

  test("field ground geometry applies flatten masks at center, falloff, and outside", () => {
    const field = resolveTerrainField(
      terrain({
        height: 8,
        seed: "mesh-flatten",
        frequency: 0.05,
        flatten: [{ center: [0, 0], radius: 4, height: 1, falloff: 4 }],
      }),
    );
    const geometry = createFieldGroundGeometry(field, {
      size: [32, 32],
      segments: [16, 16],
      heightRange: [-4, 12],
    });
    const positions = geometry.attributes.position;
    const heightAt = (x: number, z: number): number | null => {
      let best: number | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < positions.count; i += 1) {
        const dx = positions.getX(i) - x;
        const dz = positions.getZ(i) - z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          best = positions.getY(i);
        }
      }
      return best;
    };
    expect(heightAt(0, 0)).toBeCloseTo(1, 5);
    expect(heightAt(2, 0)).toBeCloseTo(1, 5);
    const ring = heightAt(6, 0)!;
    expect(ring).not.toBeCloseTo(1, 1);
    expect(ring).toBeCloseTo(field.sampleHeight(6, 0), 5);
    expect(heightAt(14, 14)).toBeCloseTo(field.sampleHeight(14, 14), 5);
    geometry.dispose();
  });

  test("two height maps produce distinct ground geometries", () => {
    const a = heightMapField({
      columns: 2,
      rows: 2,
      samples: [0, 0, 0, 0],
      bounds: { w: 8, d: 8 },
      heightScale: 1,
    });
    const b = heightMapField({
      columns: 2,
      rows: 2,
      samples: [4, 4, 4, 4],
      bounds: { w: 8, d: 8 },
      heightScale: 1,
    });
    const geoA = createFieldGroundGeometry(a, { size: [8, 8], segments: [2, 2] });
    const geoB = createFieldGroundGeometry(b, { size: [8, 8], segments: [2, 2] });
    expect(geoA.attributes.position.getY(0)).not.toBe(geoB.attributes.position.getY(0));
    expect(geoB.attributes.position.getY(0)).toBeCloseTo(4, 5);
    geoA.dispose();
    geoB.dispose();
  });
});
