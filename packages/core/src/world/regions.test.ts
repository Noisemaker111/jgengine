import { describe, expect, test } from "bun:test";
import { createRegionField, isRegionField, type RegionDef } from "@jgengine/core/world/regions";

interface Tag {
  label: string;
}

const REGIONS: readonly RegionDef<Tag>[] = [
  { id: "sea", selector: [0.1, 0.5], height: { baseHeight: -8, amplitude: 2, frequency: 0.02 }, water: "#204060", data: { label: "sea" } },
  { id: "plain", selector: [0.5, 0.5], height: { baseHeight: 1, amplitude: 1, frequency: 0.02 }, tint: "#5a8a3c", data: { label: "plain" } },
  { id: "marsh", selector: [0.6, 0.9], height: { baseHeight: -0.3, amplitude: 0.5, frequency: 0.03 }, water: "#3f4a2a", fog: "#43502f", fogDensity: 0.6, speedMultiplier: 0.6, data: { label: "marsh" } },
  { id: "peak", selector: [0.9, 0.3], height: { baseHeight: 20, amplitude: 15, frequency: 0.015, ridged: true }, tint: [0.5, 0.5, 0.52], data: { label: "peak" } },
];

describe("regions", () => {
  test("is deterministic and resolves a region everywhere", () => {
    const field = createRegionField({ regions: REGIONS, seed: 9 });
    expect(isRegionField(field)).toBe(true);
    const twin = createRegionField({ regions: REGIONS, seed: 9 });
    for (let x = -600; x <= 600; x += 60) {
      for (let z = -600; z <= 600; z += 60) {
        const sample = field.sampleRegion(x, z);
        expect(REGIONS).toContain(sample.region);
        expect(field.sampleHeight(x, z)).toBe(twin.sampleHeight(x, z));
      }
    }
  });

  test("blends heights so the map spans below sea level to peaks", () => {
    const field = createRegionField({ regions: REGIONS, seed: 3 });
    let min = Infinity;
    let max = -Infinity;
    for (let x = -900; x <= 900; x += 18) {
      for (let z = -900; z <= 900; z += 18) {
        const h = field.sampleHeight(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeLessThan(field.seaLevel);
    expect(max).toBeGreaterThan(12);
  });

  test("surfaces generic tint/water/fog/speed and opaque data", () => {
    const field = createRegionField({ regions: REGIONS, seed: 3 });
    let sawWater = false;
    let sawFog = false;
    let sawSlow = false;
    for (let x = -900; x <= 900; x += 22) {
      for (let z = -900; z <= 900; z += 22) {
        const sample = field.sampleRegion(x, z);
        expect(sample.tint.length).toBe(3);
        expect(sample.data?.label).toBe(sample.region.id === "sea" ? "sea" : sample.data!.label);
        if (sample.water !== null) sawWater = true;
        if (sample.fog !== null) sawFog = true;
        if (sample.speedMultiplier < 0.99) sawSlow = true;
      }
    }
    expect(sawWater).toBe(true);
    expect(sawFog).toBe(true);
    expect(sawSlow).toBe(true);
  });

  test("throws on an empty catalog", () => {
    expect(() => createRegionField({ regions: [] })).toThrow();
  });
});
