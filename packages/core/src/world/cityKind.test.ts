import { describe, expect, test } from "bun:test";

import { readCityRules, resolveCityObject, CITY_DEFAULTS, CITY_SCHEMA } from "./cityKind";
import type { SceneKindObject } from "../scene/sceneKinds";

function cityVolume(meta: Record<string, unknown> = {}, overrides: Partial<SceneKindObject> = {}): SceneKindObject {
  return {
    id: "vol-city-1",
    kind: "city",
    center: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 200, y: 10, z: 200 },
    meta,
    ...overrides,
  };
}

describe("readCityRules", () => {
  test("empty meta yields defaults", () => {
    expect(readCityRules(undefined)).toEqual(CITY_DEFAULTS);
  });

  test("swapped floor bounds are normalized", () => {
    const rules = readCityRules({ floorsMin: 12, floorsMax: 3 });
    expect(rules.floorsMin).toBe(3);
    expect(rules.floorsMax).toBe(12);
  });

  test("schema covers every rule knob", () => {
    const keys = CITY_SCHEMA.fields.filter((field) => field.type !== "action").map((field) => field.key);
    for (const key of Object.keys(CITY_DEFAULTS)) expect(keys).toContain(key);
  });
});

describe("resolveCityObject", () => {
  test("same volume resolves to the identical plan", () => {
    const a = resolveCityObject(cityVolume({ seed: "downtown" }));
    const b = resolveCityObject(cityVolume({ seed: "downtown" }));
    expect(a).toEqual(b);
    expect(a!.streets.length).toBeGreaterThan(0);
    expect(a!.lots.length).toBeGreaterThan(0);
  });

  test("different seeds produce different plans", () => {
    const a = resolveCityObject(cityVolume({ seed: "alpha" }));
    const b = resolveCityObject(cityVolume({ seed: "beta" }));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("empty seed falls back to the volume id deterministically", () => {
    const a = resolveCityObject(cityVolume());
    const b = resolveCityObject(cityVolume());
    const c = resolveCityObject(cityVolume({}, { id: "vol-city-2" }));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  test("full grid-ness with zero curviness gives ruler-straight axis-aligned streets", () => {
    const city = resolveCityObject(cityVolume({ seed: "nyc", gridness: 1, curviness: 0, branching: 0 }))!;
    expect(city.streets.length).toBeGreaterThan(4);
    for (const street of city.streets) {
      const xs = street.points.map((p) => p[0]);
      const zs = street.points.map((p) => p[1]);
      const xSpread = Math.max(...xs) - Math.min(...xs);
      const zSpread = Math.max(...zs) - Math.min(...zs);
      // One coordinate stays (near) constant on every grid street.
      expect(Math.min(xSpread, zSpread)).toBeLessThan(0.01);
    }
  });

  test("curviness makes streets wander", () => {
    const city = resolveCityObject(cityVolume({ seed: "la", gridness: 1, curviness: 0.9, branching: 0 }))!;
    const spreads = city.streets.map((street) => {
      const xs = street.points.map((p) => p[0]);
      const zs = street.points.map((p) => p[1]);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    });
    expect(Math.max(...spreads)).toBeGreaterThan(5);
  });

  test("branching adds lanes", () => {
    const none = resolveCityObject(cityVolume({ seed: "b", branching: 0 }))!;
    const lots = resolveCityObject(cityVolume({ seed: "b", branching: 1 }))!;
    expect(none.streets.filter((s) => s.level === "lane").length).toBe(0);
    expect(lots.streets.filter((s) => s.level === "lane").length).toBeGreaterThan(0);
    expect(lots.streets.length).toBeGreaterThan(none.streets.length);
  });

  test("open space controls parks and parks displace buildings", () => {
    const dense = resolveCityObject(cityVolume({ seed: "p", openSpace: 0 }))!;
    const parky = resolveCityObject(cityVolume({ seed: "p", openSpace: 0.85 }))!;
    expect(dense.parks.length).toBe(0);
    expect(parky.parks.length).toBeGreaterThan(3);
    expect(parky.lots.length).toBeLessThan(dense.lots.length);
  });

  test("building density scales lot count and floors honor bounds", () => {
    const sparse = resolveCityObject(cityVolume({ seed: "d", buildingDensity: 0.1 }))!;
    const dense = resolveCityObject(cityVolume({ seed: "d", buildingDensity: 1 }))!;
    expect(dense.lots.length).toBeGreaterThan(sparse.lots.length);
    const bounded = resolveCityObject(cityVolume({ seed: "d", floorsMin: 4, floorsMax: 6 }))!;
    for (const lot of bounded.lots) {
      expect(lot.floors).toBeGreaterThanOrEqual(4);
      expect(lot.floors).toBeLessThanOrEqual(6);
    }
  });

  test("everything stays inside the volume footprint", () => {
    const city = resolveCityObject(cityVolume({ seed: "bounds", curviness: 1, gridness: 0, branching: 1 }))!;
    for (const street of city.streets) {
      for (const [x, z] of street.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(200);
        expect(Math.abs(z)).toBeLessThanOrEqual(200);
      }
    }
    for (const lot of city.lots) {
      expect(Math.abs(lot.center[0])).toBeLessThanOrEqual(200);
      expect(Math.abs(lot.center[1])).toBeLessThanOrEqual(200);
    }
  });

  test("a rotated, offset volume moves the plan with it", () => {
    const local = resolveCityObject(cityVolume({ seed: "r" }))!;
    const moved = resolveCityObject(cityVolume({ seed: "r" }, { center: { x: 1000, y: 0, z: -500 }, rotationY: Math.PI / 2 }))!;
    expect(moved.streets.length).toBe(local.streets.length);
    for (const street of moved.streets) {
      for (const [x, z] of street.points) {
        expect(Math.abs(x - 1000)).toBeLessThanOrEqual(201);
        expect(Math.abs(z + 500)).toBeLessThanOrEqual(201);
      }
    }
  });

  test("a footprint smaller than a block yields an empty plan, not a crash", () => {
    const city = resolveCityObject(cityVolume({}, { halfExtents: { x: 10, y: 5, z: 10 } }))!;
    expect(city.streets.length).toBe(0);
    expect(city.lots.length).toBe(0);
  });

  test("missing footprint resolves to null", () => {
    expect(resolveCityObject({ id: "x", kind: "city" })).toBeNull();
  });
});
