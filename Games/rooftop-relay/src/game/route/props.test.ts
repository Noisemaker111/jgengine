import { describe, expect, test } from "bun:test";

import { generateRoofProps } from "./props";

describe("rooftop-relay roof props", () => {
  test("meets the 60+ roof prop content budget", () => {
    expect(generateRoofProps().length).toBeGreaterThanOrEqual(60);
  });

  test("is deterministic under the same seed", () => {
    const a = generateRoofProps(undefined, "seed-a");
    const b = generateRoofProps(undefined, "seed-a");
    expect(a).toEqual(b);
  });

  test("different seeds reshuffle obstacle placement", () => {
    const a = generateRoofProps(undefined, "seed-a");
    const b = generateRoofProps(undefined, "seed-b");
    expect(a).not.toEqual(b);
  });

  test("never places an obstacle on a start or handoff platform", () => {
    for (const prop of generateRoofProps()) {
      if (!prop.solid) continue;
      expect(prop.id.includes("-block1-") || prop.id.includes("-block5-")).toBe(false);
    }
  });

  test("covers every obstacle and decor catalog id at least once", () => {
    const ids = new Set(generateRoofProps().map((prop) => prop.catalogId));
    for (const expected of ["roof_vent", "roof_chimney", "roof_crate", "roof_watertank", "roof_rail", "roof_skylight", "roof_antenna", "finish_banner"]) {
      expect(ids.has(expected)).toBe(true);
    }
  });
});
