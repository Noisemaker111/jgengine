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

describe("resolveCityObject v2 quality", () => {
  function corners(lot: { center: readonly [number, number]; size: readonly [number, number]; rotationY: number }): [number, number][] {
    const c = Math.cos(lot.rotationY);
    const s = Math.sin(lot.rotationY);
    const [hw, hd] = [lot.size[0] / 2, lot.size[1] / 2];
    return ([[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]] as const).map(([dx, dz]) => [
      lot.center[0] + dx * c + dz * s,
      lot.center[1] - dx * s + dz * c,
    ]);
  }

  function separated(a: ReturnType<typeof corners>, aAngle: number, b: ReturnType<typeof corners>, bAngle: number): boolean {
    for (const angle of [aAngle, bAngle]) {
      for (const [ax, az] of [
        [Math.cos(angle), -Math.sin(angle)],
        [Math.sin(angle), Math.cos(angle)],
      ] as const) {
        let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (const [x, z] of a) { const p = x * ax + z * az; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
        for (const [x, z] of b) { const p = x * ax + z * az; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
        if (maxA < minB || maxB < minA) return true;
      }
    }
    return false;
  }

  test("no two building lots overlap, even at max density and curviness", () => {
    for (const seed of ["q1", "q2", "q3"]) {
      const city = resolveCityObject(cityVolume({ seed, buildingDensity: 1, curviness: 0.8, gridness: 0.2, branching: 1 }))!;
      const cs = city.lots.map((lot) => ({ corners: corners(lot), angle: lot.rotationY, center: lot.center }));
      for (let i = 0; i < cs.length; i += 1) {
        for (let j = i + 1; j < cs.length; j += 1) {
          const a = cs[i]!, b = cs[j]!;
          const dx = a.center[0] - b.center[0];
          const dz = a.center[1] - b.center[1];
          if (dx * dx + dz * dz > 40 * 40) continue;
          expect(separated(a.corners, a.angle, b.corners, b.angle)).toBe(true);
        }
      }
    }
  });

  test("no building lot center sits on a street", () => {
    const city = resolveCityObject(cityVolume({ seed: "roads", buildingDensity: 1, curviness: 0.7, gridness: 0.3, branching: 1 }))!;
    for (const lot of city.lots) {
      for (const street of city.streets) {
        for (let i = 0; i + 1 < street.points.length; i += 1) {
          const [ax, az] = street.points[i]!;
          const [bx, bz] = street.points[i + 1]!;
          const vx = bx - ax, vz = bz - az;
          const len2 = vx * vx + vz * vz;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((lot.center[0] - ax) * vx + (lot.center[1] - az) * vz) / len2));
          const d = Math.hypot(lot.center[0] - (ax + vx * t), lot.center[1] - (az + vz * t));
          expect(d).toBeGreaterThan(street.width / 2);
        }
      }
    }
  });

  test("branch lanes connect to the network or are dropped", () => {
    const city = resolveCityObject(cityVolume({ seed: "net", branching: 1, gridness: 0.5, curviness: 0.4 }))!;
    const lanes = city.streets.filter((s) => s.level === "lane");
    expect(lanes.length).toBeGreaterThan(0);
    for (const lane of lanes) {
      const [ex, ez] = lane.points[lane.points.length - 1]!;
      let nearest = Infinity;
      for (const other of city.streets) {
        if (other === lane) continue;
        for (const [x, z] of other.points) nearest = Math.min(nearest, Math.hypot(x - ex, z - ez));
      }
      const length = lane.points.reduce((sum, p, i) => (i === 0 ? 0 : sum + Math.hypot(p[0] - lane.points[i - 1]![0], p[1] - lane.points[i - 1]![1])), 0);
      // Either the lane ended by touching another street, or it earned its keep by length.
      expect(nearest < 20 || length > 25).toBe(true);
    }
  });

  test("steep terrain rejects lots (cliff faces stay open) and stays deterministic", () => {
    const cliff = { sampleHeight: (x: number) => (x > 0 ? x * 2 : 0) };
    const flat = { sampleHeight: () => 0 };
    const onCliff = resolveCityObject(cityVolume({ seed: "cliff", maxSlope: 0.3 }), cliff)!;
    const onCliff2 = resolveCityObject(cityVolume({ seed: "cliff", maxSlope: 0.3 }), cliff)!;
    const onFlat = resolveCityObject(cityVolume({ seed: "cliff", maxSlope: 0.3 }), flat)!;
    expect(onCliff).toEqual(onCliff2);
    expect(onCliff.lots.length).toBeLessThan(onFlat.lots.length);
    for (const lot of onCliff.lots) expect(lot.center[0]).toBeLessThan(10);
  });
});

describe("bridges", () => {
  // A narrow "river" strip at x in [20, 44]: ground dives below the default minElevation (-2).
  const river = { sampleHeight: (x: number) => (x > 20 && x < 44 ? -8 : 2) };

  test("streets crossing water gain bridge decks from bank to bank", () => {
    const city = resolveCityObject(cityVolume({ seed: "riv", gridness: 1, curviness: 0, branching: 0 }), river)!;
    expect(city.bridges.length).toBeGreaterThan(0);
    for (const bridge of city.bridges) {
      const first = bridge.points[0]!;
      const last = bridge.points[bridge.points.length - 1]!;
      expect(river.sampleHeight(first[0])).toBeGreaterThanOrEqual(-2);
      expect(river.sampleHeight(last[0])).toBeGreaterThanOrEqual(-2);
    }
    // No land street keeps an underwater point.
    for (const street of city.streets) {
      for (const [x] of street.points) expect(river.sampleHeight(x)).toBeGreaterThanOrEqual(-2);
    }
  });

  test("bridges toggle off clips streets at the shore instead", () => {
    const city = resolveCityObject(cityVolume({ seed: "riv", gridness: 1, curviness: 0, branching: 0, bridges: false }), river)!;
    expect(city.bridges.length).toBe(0);
    for (const street of city.streets) {
      for (const [x] of street.points) expect(river.sampleHeight(x)).toBeGreaterThanOrEqual(-2);
    }
  });

  test("sidewalks rule parses", () => {
    expect(readCityRules({ sidewalks: false }).sidewalks).toBe(false);
    expect(readCityRules({}).sidewalks).toBe(true);
  });
});
