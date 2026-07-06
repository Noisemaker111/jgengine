import { describe, expect, test } from "bun:test";
import { biomes } from "@jgengine/core/world/features";
import { createBiomeField, DEFAULT_BIOMES, isBiomeField } from "@jgengine/core/world/biomes";
import { terrainFieldFor } from "@jgengine/core/world/terrain";

describe("biomes", () => {
  test("ships a rich catalog with unique ids and valid climate ranges", () => {
    expect(DEFAULT_BIOMES.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(DEFAULT_BIOMES.map((biome) => biome.id));
    expect(ids.size).toBe(DEFAULT_BIOMES.length);
    for (const biome of DEFAULT_BIOMES) {
      for (const value of [biome.climate.temperature, biome.climate.humidity, biome.climate.continentalness]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  test("field is deterministic and every sample resolves a biome", () => {
    const field = createBiomeField({ seed: 42 });
    expect(isBiomeField(field)).toBe(true);
    for (let x = -400; x <= 400; x += 80) {
      for (let z = -400; z <= 400; z += 80) {
        const sample = field.sampleBiome(x, z);
        expect(DEFAULT_BIOMES).toContain(sample.biome);
        expect(field.sampleHeight(x, z)).toBe(createBiomeField({ seed: 42 }).sampleHeight(x, z));
      }
    }
  });

  test("catalog produces oceans below and peaks above sea level across the map", () => {
    const field = createBiomeField({ seed: 7 });
    let min = Infinity;
    let max = -Infinity;
    for (let x = -800; x <= 800; x += 20) {
      for (let z = -800; z <= 800; z += 20) {
        const height = field.sampleHeight(x, z);
        if (height < min) min = height;
        if (height > max) max = height;
      }
    }
    expect(min).toBeLessThan(field.seaLevel);
    expect(max).toBeGreaterThan(12);
  });

  test("water and effects surface from the dominant biome", () => {
    const field = createBiomeField({ seed: 7 });
    let sawWater = false;
    let sawEffect = false;
    for (let x = -800; x <= 800; x += 25) {
      for (let z = -800; z <= 800; z += 25) {
        const sample = field.sampleBiome(x, z);
        if (sample.water !== null) sawWater = true;
        if (sample.effects.length > 0) sawEffect = true;
      }
    }
    expect(sawWater).toBe(true);
    expect(sawEffect).toBe(true);
  });

  test("terrainFieldFor(biomes()) returns a biome field", () => {
    expect(isBiomeField(terrainFieldFor(biomes()))).toBe(true);
    expect(isBiomeField(terrainFieldFor(biomes({ seed: "world" })))).toBe(true);
  });
});
