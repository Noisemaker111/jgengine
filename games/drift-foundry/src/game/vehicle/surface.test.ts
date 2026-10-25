import { describe, expect, test } from "bun:test";

import { HAUL_ROAD_HALF_WIDTH } from "../run/constants";
import { ZONES } from "../zones/catalog";
import { surfaceAt, surfaceFrictionAt } from "./surface";

const ZONE_SAMPLES: readonly (readonly [string, number])[] = [
  ["canyons", 60],
  ["flats", 200],
  ["gantry", 360],
];

describe("drift-foundry yard surfaces", () => {
  test("the paved haul strip uses each zone's authored surface grip", () => {
    for (const [id, z] of ZONE_SAMPLES) {
      const zone = ZONES.find((entry) => entry.id === id)!;
      const sample = surfaceAt(0, z);
      expect(sample.paved).toBe(true);
      expect(sample.zone.id).toBe(zone.surface.id);
      expect(sample.grip).toBeCloseTo(zone.surface.grip, 6);
      expect(sample.label).toBe(zone.surface.label);
    }
  });

  test("the yards really do differ: oil-slick canyons and gravel gantry grip less than concrete", () => {
    const concrete = surfaceAt(0, 200).grip;
    const gravel = surfaceAt(0, 360).grip;
    const oil = surfaceAt(0, 60).grip;
    expect(concrete).toBeGreaterThan(gravel);
    expect(concrete).toBeGreaterThan(oil);
  });

  test("the dirt shoulders outside the haul strip grip less, and the edge fades instead of stepping", () => {
    const paved = surfaceAt(0, 200);
    const edge = surfaceAt(HAUL_ROAD_HALF_WIDTH - 0.01, 200);
    const justOver = surfaceAt(HAUL_ROAD_HALF_WIDTH + 0.05, 200);
    const shoulder = surfaceAt(15, 200);
    expect(edge.grip).toBeCloseTo(paved.grip, 6);
    expect(justOver.grip).toBeLessThan(edge.grip);
    expect(justOver.grip).toBeGreaterThan(shoulder.grip);
    expect(shoulder.paved).toBe(false);
    expect(shoulder.label).toContain("SHOULDER");
    expect(shoulder.grip).toBeLessThan(paved.grip * 0.9);
  });

  test("surfaceFrictionAt is symmetric in x and never returns a runaway multiplier", () => {
    for (const x of [0, 5, 9, 15, 18.5, 40]) {
      expect(surfaceFrictionAt(x, 200)).toBeCloseTo(surfaceFrictionAt(-x, 200), 9);
      expect(surfaceFrictionAt(x, 200)).toBeGreaterThan(0.5);
      expect(surfaceFrictionAt(x, 200)).toBeLessThanOrEqual(1);
    }
  });
});
