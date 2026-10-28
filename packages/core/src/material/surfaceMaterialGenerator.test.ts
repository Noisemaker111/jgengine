import { describe, expect, test } from "bun:test";

import { bakeGeneratorVariants } from "@jgengine/core/generator/generator";
import {
  bakeSurfaceMaterial,
  isSurfaceMaterialMaps,
  SURFACE_MATERIAL_GENERATOR,
  SURFACE_MATERIAL_KINDS,
  SURFACE_MATERIAL_SCHEMA,
  surfaceMaterialMeta,
  type SurfaceMaterialMaps,
} from "./surfaceMaterialGenerator";

function small(preset: string, extra: Record<string, unknown> = {}): SurfaceMaterialMaps {
  return bakeSurfaceMaterial({ preset, params: { resolution: "128", ...extra } });
}

/** Mean absolute difference of one channel between two texel columns (x) of a map. */
function columnStep(bytes: Uint8Array, size: number, channel: number, a: number, b: number): number {
  let sum = 0;
  for (let y = 0; y < size; y += 1) sum += Math.abs((bytes[(y * size + a) * 4 + channel] ?? 0) - (bytes[(y * size + b) * 4 + channel] ?? 0));
  return sum / size;
}

function rowStep(bytes: Uint8Array, size: number, channel: number, a: number, b: number): number {
  let sum = 0;
  for (let x = 0; x < size; x += 1) sum += Math.abs((bytes[(a * size + x) * 4 + channel] ?? 0) - (bytes[(b * size + x) * 4 + channel] ?? 0));
  return sum / size;
}

/** Mean step between neighbouring interior columns, the yardstick a seam is compared against. */
function interiorColumnStep(bytes: Uint8Array, size: number, channel: number): number {
  let sum = 0;
  for (let x = 1; x < size; x += 1) sum += columnStep(bytes, size, channel, x - 1, x);
  return sum / (size - 1);
}

function interiorRowStep(bytes: Uint8Array, size: number, channel: number): number {
  let sum = 0;
  for (let y = 1; y < size; y += 1) sum += rowStep(bytes, size, channel, y - 1, y);
  return sum / (size - 1);
}

describe("surface material generator", () => {
  test("bakes every kind into square maps of the asked size", () => {
    for (const kind of SURFACE_MATERIAL_KINDS) {
      const maps = bakeSurfaceMaterial({ params: { kind, resolution: "128" }, seed: kind });
      expect(isSurfaceMaterialMaps(maps)).toBe(true);
      expect(maps.kind).toBe(kind);
      expect(maps.size).toBe(128);
      expect(maps.albedo.length).toBe(128 * 128 * 4);
      expect(maps.surface.length).toBe(128 * 128 * 4);
      expect(maps.meanLinear.every((c) => c > 0 && c < 1)).toBe(true);
    }
  });

  test("the same spec and seed bake the same bytes; another seed bakes different ones", () => {
    const a = small("cliff");
    const b = small("cliff");
    expect(Buffer.from(a.albedo).equals(Buffer.from(b.albedo))).toBe(true);
    expect(Buffer.from(a.surface).equals(Buffer.from(b.surface))).toBe(true);
    const c = bakeSurfaceMaterial({ preset: "cliff", seed: "other", params: { resolution: "128" } });
    expect(Buffer.from(a.albedo).equals(Buffer.from(c.albedo))).toBe(false);
  });

  test("every preset tiles: the wrap-around step is no larger than an interior step", () => {
    for (const preset of SURFACE_MATERIAL_SCHEMA.presets ?? []) {
      const maps = small(preset.id);
      const last = maps.size - 1;
      // Height (albedo alpha), colour and the packed normal all have to wrap.
      for (const [bytes, channel] of [[maps.albedo, 3], [maps.albedo, 1], [maps.surface, 0], [maps.surface, 1]] as const) {
        const seamX = columnStep(bytes, maps.size, channel, last, 0);
        const seamY = rowStep(bytes, maps.size, channel, last, 0);
        const typicalX = interiorColumnStep(bytes, maps.size, channel);
        const typicalY = interiorRowStep(bytes, maps.size, channel);
        expect(seamX).toBeLessThanOrEqual(typicalX * 1.6 + 1);
        expect(seamY).toBeLessThanOrEqual(typicalY * 1.6 + 1);
      }
    }
  });

  test("relief 0 bakes a flat normal map", () => {
    const maps = small("rock", { relief: 0 });
    for (let i = 0; i < maps.size * maps.size; i += 97) {
      expect(maps.surface[i * 4]).toBeGreaterThanOrEqual(127);
      expect(maps.surface[i * 4]).toBeLessThanOrEqual(128);
      expect(maps.surface[i * 4 + 1]).toBeGreaterThanOrEqual(127);
      expect(maps.surface[i * 4 + 1]).toBeLessThanOrEqual(128);
    }
  });

  test("wetness lowers roughness", () => {
    const mean = (maps: SurfaceMaterialMaps) => {
      let sum = 0;
      for (let i = 0; i < maps.size * maps.size; i += 1) sum += maps.surface[i * 4 + 2] ?? 0;
      return sum / (maps.size * maps.size);
    };
    expect(mean(small("dirt", { wetness: 0.9 }))).toBeLessThan(mean(small("dirt", { wetness: 0 })) - 20);
  });

  test("a lower detail level bakes a smaller map", () => {
    expect(bakeSurfaceMaterial({ preset: "sand", params: { resolution: "256" } }, { detail: 0.5 }).size).toBe(128);
  });

  test("an unknown preset names the known ones", () => {
    expect(() => surfaceMaterialMeta({ preset: "lava-glass" })).toThrow(/Known presets: .*beach-sand/);
  });

  test("variants differ from each other", () => {
    const baked = bakeGeneratorVariants(SURFACE_MATERIAL_GENERATOR, surfaceMaterialMeta({ preset: "soil", params: { resolution: "64" } }), { count: 3 });
    const bytes = baked.map((entry) => Buffer.from(entry.lods[0]?.output.albedo ?? new Uint8Array()));
    expect(bytes[0]?.equals(bytes[1] ?? Buffer.alloc(0))).toBe(false);
    expect(bytes[1]?.equals(bytes[2] ?? Buffer.alloc(0))).toBe(false);
  });
});
