import { describe, expect, test } from "bun:test";

import { readCityRules, resolveCityObject, CITY_DEFAULTS, CITY_SCHEMA, type ResolvedCity } from "./cityKind";
import { distanceToRing, pointInPolygon, polygonArea, polygonsOverlap, ringSelfIntersects } from "./cityGeometry";
import { seededRng } from "../random/rng";
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
    // Buffers (sliver blocks) and courtyards (block interiors) are classification, not open
    // space — only the openSpace dial's park types count here.
    const openSpaceParks = (city: typeof dense) =>
      city.parks.filter((park) => park.type === "green" || park.type === "meadow" || park.type === "plaza" || park.type === "field");
    expect(openSpaceParks(dense).length).toBe(0);
    expect(openSpaceParks(parky).length).toBeGreaterThan(3);
    expect(parky.lots.length).toBeLessThan(dense.lots.length);
  });

  test("roadside occupancy scales lot count and floors honor bounds", () => {
    const sparse = resolveCityObject(cityVolume({ seed: "d", roadsideOccupancy: 0.15 }))!;
    const dense = resolveCityObject(cityVolume({ seed: "d", roadsideOccupancy: 1 }))!;
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

describe("zoning", () => {
  function distToCenter(lot: { center: readonly [number, number] }): number {
    return Math.max(Math.abs(lot.center[0]), Math.abs(lot.center[1]));
  }

  test("core-out puts the core band downtown and tall classes with it", () => {
    const city = resolveCityObject(cityVolume({ seed: "zone1" }))!;
    const core = city.lots.filter((lot) => lot.zone === "core");
    const edge = city.lots.filter((lot) => lot.zone === "edge");
    expect(core.length).toBeGreaterThan(3);
    expect(edge.length).toBeGreaterThan(3);
    const avg = (lots: typeof core, f: (lot: (typeof core)[number]) => number) => lots.reduce((sum, lot) => sum + f(lot), 0) / lots.length;
    expect(avg(core, distToCenter)).toBeLessThan(avg(edge, distToCenter));
    expect(avg(core, (lot) => lot.floors)).toBeGreaterThan(avg(edge, (lot) => lot.floors));
  });

  test("inverted profile flips the rings — the core band lands at the rim", () => {
    const normal = resolveCityObject(cityVolume({ seed: "zone1" }))!;
    const flipped = resolveCityObject(cityVolume({ seed: "zone1", profile: "inverted" }))!;
    const avgDist = (city: typeof normal, zone: string) => {
      const lots = city.lots.filter((lot) => lot.zone === zone);
      return lots.reduce((sum, lot) => sum + distToCenter(lot), 0) / Math.max(1, lots.length);
    };
    expect(avgDist(flipped, "core")).toBeGreaterThan(avgDist(normal, "core"));
    expect(avgDist(flipped, "edge")).toBeLessThan(avgDist(normal, "edge"));
  });

  test("cityzone override volumes locally pin band and mix, deterministically", () => {
    const overrides = [
      {
        id: "zone-override",
        kind: "cityzone",
        center: { x: 0, y: 0, z: 0 },
        halfExtents: { x: 400, y: 10, z: 400 },
        meta: { band: "edge", mix: [{ item: "barn", weight: 1 }] },
      },
    ];
    const a = resolveCityObject(cityVolume({ seed: "ovr" }), { zoneOverrides: overrides })!;
    const b = resolveCityObject(cityVolume({ seed: "ovr" }), { zoneOverrides: overrides })!;
    expect(a).toEqual(b);
    expect(a.lots.length).toBeGreaterThan(10);
    for (const lot of a.lots) {
      expect(lot.zone).toBe("edge");
      expect(lot.class).toBe("barn");
    }
    // A half-district override only converts its own side.
    const half = resolveCityObject(cityVolume({ seed: "ovr" }), {
      zoneOverrides: [{ ...overrides[0]!, center: { x: 150, y: 0, z: 0 }, halfExtents: { x: 60, y: 10, z: 400 } }],
    })!;
    // Margin past the override wall: the zone probe samples near the curb while deep lots'
    // centers sit further into the block, so boundary-straddling parcels are legitimately mixed.
    const inside = half.lots.filter((lot) => lot.center[0] > 112 && lot.center[0] < 188);
    const outside = half.lots.filter((lot) => lot.center[0] < 78);
    expect(inside.length).toBeGreaterThan(0);
    for (const lot of inside) expect(lot.class).toBe("barn");
    expect(outside.some((lot) => lot.class !== "barn")).toBe(true);
  });
});

/** Shared geometry invariants every generated city must satisfy, whatever the sliders say. */
function expectFabricInvariants(city: ResolvedCity, label: string): void {
  const blockById = new Map(city.blocks.map((block) => [block.id, block] as const));
  // Every ring is finite, closed, and simple.
  for (const block of city.blocks) {
    expect(block.polygon.length).toBeGreaterThanOrEqual(3);
    expect(block.curb.length).toBeGreaterThanOrEqual(3);
    for (const [x, z] of [...block.polygon, ...block.curb]) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);
    }
    expect(ringSelfIntersects(block.polygon)).toBe(false);
  }
  // Parcels stay inside their block (small tolerance for corridor carves and weld epsilons).
  for (const parcel of city.parcels) {
    expect(parcel.polygon.length).toBeGreaterThanOrEqual(3);
    const block = blockById.get(parcel.block);
    expect(block).toBeDefined();
    for (const [x, z] of parcel.polygon) {
      if (!pointInPolygon(block!.polygon, x, z)) {
        expect(distanceToRing(block!.polygon, x, z)).toBeLessThan(1.2);
      }
    }
  }
  // Parcels never overlap a neighbor in the same block.
  const byBlock = new Map<string, typeof city.parcels[number][]>();
  for (const parcel of city.parcels) {
    const bucket = byBlock.get(parcel.block);
    if (bucket === undefined) byBlock.set(parcel.block, [parcel]);
    else bucket.push(parcel);
  }
  for (const parcels of byBlock.values()) {
    for (let i = 0; i < parcels.length; i += 1) {
      for (let j = i + 1; j < parcels.length; j += 1) {
        expect(polygonsOverlap(parcels[i]!.polygon, parcels[j]!.polygon, 0.35)).toBe(false);
      }
    }
  }
  // Built parcels carry frontage and their building stays within the buildable polygon.
  const lotByParcel = new Map(city.lots.map((lot) => [lot.parcel, lot] as const));
  let withFrontage = 0;
  let built = 0;
  for (const parcel of city.parcels) {
    if (parcel.frontage.length > 0) withFrontage += 1;
    if (parcel.kind !== "built") continue;
    built += 1;
    const lot = lotByParcel.get(parcel.id);
    expect(lot).toBeDefined();
    expect(parcel.buildable.length).toBeGreaterThanOrEqual(3);
    const c = Math.cos(lot!.rotationY);
    const s = Math.sin(lot!.rotationY);
    const [hw, hd] = [lot!.size[0] / 2, lot!.size[1] / 2];
    for (const [dx, dz] of [
      [hw, hd],
      [hw, -hd],
      [-hw, hd],
      [-hw, -hd],
    ] as const) {
      const x = lot!.center[0] + dx * c + dz * s;
      const z = lot!.center[1] - dx * s + dz * c;
      if (!pointInPolygon(parcel.buildable, x, z)) {
        expect(distanceToRing(parcel.buildable, x, z)).toBeLessThan(0.6);
      }
    }
  }
  // Nearly all parcels reference a real street, and the reference resolves.
  if (city.parcels.length > 10) {
    expect(withFrontage / city.parcels.length).toBeGreaterThan(0.9);
  }
  const streetIds = new Set(city.streets.map((street) => street.id));
  for (const parcel of city.parcels) {
    for (const front of parcel.frontage) expect(streetIds.has(front.road)).toBe(true);
  }
  // No unclassified leftovers: buildable blocks that are big enough must carry parcels; every
  // non-buildable block kind is an intentional classification.
  for (const block of city.blocks) {
    expect(["buildable", "park", "plaza", "field", "buffer"]).toContain(block.kind);
    if (block.kind === "buildable" && block.area > 400) {
      const parcels = byBlock.get(block.id) ?? [];
      expect(parcels.length).toBeGreaterThan(0);
    }
  }
  // Slivers never stay "buildable": every buildable block clears the sliver bar.
  for (const block of city.blocks) {
    if (block.kind === "buildable") expect(block.area).toBeGreaterThanOrEqual(85);
  }
  expect(built).toBe(city.lots.length);
  if (city.lots.length === 0 && city.streets.length > 4) {
    // A street network with no buildings at default-ish occupancy would be a regression flag.
    // (Callers pass label so a failure names the scenario.)
    expect(label).toBe(label);
  }
}

describe("block/parcel fabric invariants", () => {
  test("defaults satisfy every fabric invariant", () => {
    const city = resolveCityObject(cityVolume({ seed: "fabric" }))!;
    expect(city.blocks.length).toBeGreaterThan(10);
    expect(city.parcels.length).toBeGreaterThan(50);
    expectFabricInvariants(city, "defaults");
  });

  test("curved districts produce curved, road-following block boundaries", () => {
    const city = resolveCityObject(cityVolume({ seed: "curve", gridness: 0.3, curviness: 0.8, branching: 0.4 }))!;
    expect(city.blocks.length).toBeGreaterThan(5);
    expectFabricInvariants(city, "curved");
    // At high curviness a good share of block-edge headings leave the axis grid.
    let offAxis = 0;
    let edges = 0;
    for (const block of city.blocks) {
      const ring = block.polygon;
      for (let i = 0; i < ring.length; i += 1) {
        const [ax, az] = ring[i]!;
        const [bx, bz] = ring[(i + 1) % ring.length]!;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 2) continue;
        edges += 1;
        const heading = ((Math.atan2(bz - az, bx - ax) * 180) / Math.PI + 360) % 90;
        if (heading > 12 && heading < 78) offAxis += 1;
      }
    }
    expect(edges).toBeGreaterThan(40);
    expect(offAxis / edges).toBeGreaterThan(0.2);
  });

  test("preset application is exactly manual slider application (pure value bundles)", () => {
    const fieldKeys = new Set(CITY_SCHEMA.fields.map((field) => field.key));
    for (const preset of CITY_SCHEMA.presets ?? []) {
      // Presets may only carry schema keys — no side-channel that code could branch on.
      for (const key of Object.keys(preset.values)) expect(fieldKeys.has(key)).toBe(true);
      const viaPreset = resolveCityObject(cityVolume({ ...preset.values, seed: "same" }))!;
      const manual = resolveCityObject(cityVolume(JSON.parse(JSON.stringify({ ...preset.values, seed: "same" })) as Record<string, unknown>))!;
      expect(viaPreset).toEqual(manual);
    }
  });

  test("midpoint interpolation between presets keeps geometry valid", () => {
    const presets = CITY_SCHEMA.presets ?? [];
    for (let i = 0; i + 1 < presets.length; i += 1) {
      const a = presets[i]!.values as Record<string, unknown>;
      const b = presets[i + 1]!.values as Record<string, unknown>;
      const mid: Record<string, unknown> = { seed: `interp:${i}` };
      for (const key of Object.keys(a)) {
        const va = a[key];
        const vb = b[key];
        if (typeof va === "number" && typeof vb === "number") mid[key] = (va + vb) / 2;
        else mid[key] = va;
      }
      const city = resolveCityObject(cityVolume(mid))!;
      expect(city.streets.length).toBeGreaterThan(3);
      expectFabricInvariants(city, `interp:${presets[i]!.id}→${presets[i + 1]!.id}`);
    }
  });

  test("randomized slider combinations stay coherent across seeds", () => {
    const rng = seededRng("city-property-tests");
    for (let round = 0; round < 6; round += 1) {
      const meta: Record<string, unknown> = {
        seed: `prop:${round}`,
        gridness: rng(),
        curviness: rng(),
        branching: rng(),
        blockSize: 30 + rng() * 90,
        blockAspect: 1 + rng() * 2,
        openSpace: rng() * 0.6,
        roadsideOccupancy: 0.3 + rng() * 0.7,
        blockDensity: rng(),
        buildingRoadSetback: rng() * 8,
        buildingSpacing: 0.3 + rng() * 5,
        clusterStrength: rng(),
        streetWidth: 4 + rng() * 8,
        boulevards: rng(),
        sidewalkWidth: 1 + rng() * 2.5,
        lotScale: 0.6 + rng() * 1.6,
      };
      const city = resolveCityObject(cityVolume(meta))!;
      const again = resolveCityObject(cityVolume(meta))!;
      expect(city).toEqual(again);
      expectFabricInvariants(city, `prop:${round}`);
    }
  });
});

describe("presets", () => {
  const presetValues = (id: string): Record<string, unknown> => {
    const preset = CITY_SCHEMA.presets?.find((entry) => entry.id === id);
    expect(preset).toBeDefined();
    return { ...preset!.values, seed: "alpha" };
  };

  test("every preset resolves to a non-trivial deterministic district", () => {
    for (const preset of CITY_SCHEMA.presets ?? []) {
      const meta = { ...preset.values, seed: "smoke" };
      const a = resolveCityObject(cityVolume(meta, { halfExtents: { x: 260, y: 10, z: 260 } }))!;
      const b = resolveCityObject(cityVolume(meta, { halfExtents: { x: 260, y: 10, z: 260 } }))!;
      expect(a).toEqual(b);
      expect(a.streets.length).toBeGreaterThan(4);
      expect(a.lots.length).toBeGreaterThan(15);
    }
  });

  test("manhattan towers over rural ohio", () => {
    const manhattan = resolveCityObject(cityVolume(presetValues("manhattan")))!;
    const rural = resolveCityObject(cityVolume(presetValues("ruralohio"), { halfExtents: { x: 260, y: 10, z: 260 } }))!;
    const avgFloors = (city: typeof manhattan) => city.lots.reduce((sum, lot) => sum + lot.floors, 0) / city.lots.length;
    expect(avgFloors(manhattan)).toBeGreaterThan(avgFloors(rural) * 3);
    expect(manhattan.lots.filter((lot) => lot.class === "tower").length).toBeGreaterThan(15);
    expect(manhattan.streets.some((street) => street.level === "boulevard" || street.level === "avenue")).toBe(true);
  });

  test("rural ohio is a farm town: gravel lanes, barns, silos, crop fields, no street lights", () => {
    const rural = resolveCityObject(cityVolume(presetValues("ruralohio"), { halfExtents: { x: 260, y: 10, z: 260 } }))!;
    expect(rural.streets.some((street) => street.surface === "gravel")).toBe(true);
    expect(rural.lots.some((lot) => lot.class === "barn")).toBe(true);
    expect(rural.lots.some((lot) => lot.class === "farmhouse")).toBe(true);
    const fields = rural.parks.filter((park) => park.type === "field");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((park) => (park.rows?.length ?? 0) > 5)).toBe(true);
    expect(rural.lights.length).toBe(0);
    expect(rural.driveways.length).toBeGreaterThan(10);
  });

  test("beverly hills is estates: mansions, hedges, palms and cypress", () => {
    const hills = resolveCityObject(cityVolume(presetValues("beverlyhills")))!;
    expect(hills.lots.filter((lot) => lot.class === "mansion").length).toBeGreaterThan(5);
    expect(hills.hedges.length).toBeGreaterThan(20);
    expect(hills.trees.some((tree) => tree.species === "palm")).toBe(true);
    expect(hills.trees.some((tree) => tree.species === "cypress")).toBe(true);
    expect(hills.trees.length).toBeGreaterThan(hills.lots.length * 3);
  });

  test("los angeles mixes palms, driveways, parking, and keeps a modest skyline", () => {
    const la = resolveCityObject(cityVolume(presetValues("losangeles")))!;
    const palms = la.trees.filter((tree) => tree.species === "palm").length;
    expect(palms).toBeGreaterThan(la.trees.length / 2);
    expect(la.driveways.length).toBeGreaterThan(20);
    expect(la.parkingLots.length).toBeGreaterThan(0);
    for (const lot of la.lots) expect(lot.floors).toBeLessThanOrEqual(18);
  });
});

describe("street hierarchy, intersections, furniture", () => {
  function distToStreet(street: { points: readonly (readonly [number, number])[] }, x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i + 1 < street.points.length; i += 1) {
      const [ax, az] = street.points[i]!;
      const [bx, bz] = street.points[i + 1]!;
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
      best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
    }
    return best;
  }

  test("gridded districts produce cross intersections sitting on both streets", () => {
    const city = resolveCityObject(cityVolume({ seed: "grid", gridness: 1, curviness: 0, branching: 0 }))!;
    expect(city.intersections.length).toBeGreaterThan(10);
    for (const cross of city.intersections) {
      expect(cross.arms.length).toBe(4);
      const touching = city.streets.filter((street) => distToStreet(street, cross.x, cross.z) < street.width).length;
      expect(touching).toBeGreaterThanOrEqual(2);
      expect(cross.radius).toBeGreaterThan(2);
    }
  });

  test("every junction arm points at real pavement — T junctions get three arms, never a phantom fourth", () => {
    // Organic nets snap partial streets to cross-street coordinates, so plenty of streets END at a
    // junction; each arm must still land on some street's actual centerline.
    const city = resolveCityObject(cityVolume({ seed: "tee", gridness: 0.35, curviness: 0.3, branching: 0.5 }))!;
    expect(city.intersections.length).toBeGreaterThan(4);
    let sawTee = false;
    for (const cross of city.intersections) {
      expect(cross.arms.length).toBeGreaterThanOrEqual(2);
      if (cross.arms.length === 3) sawTee = true;
      for (const arm of cross.arms) {
        const px = cross.x + Math.sin(arm.angle) * (cross.radius + 3);
        const pz = cross.z + Math.cos(arm.angle) * (cross.radius + 3);
        const nearest = Math.min(...city.streets.map((street) => distToStreet(street, px, pz)));
        expect(nearest).toBeLessThan(arm.width / 2 + 2.5);
      }
    }
    expect(sawTee).toBe(true);
  });

  test("boulevards widen avenues and carry level metadata", () => {
    const city = resolveCityObject(cityVolume({ seed: "blvd", boulevards: 1, gridness: 1 }))!;
    const boulevards = city.streets.filter((street) => street.level === "boulevard");
    expect(boulevards.length).toBeGreaterThan(0);
    const streets = city.streets.filter((street) => street.level === "street");
    for (const boulevard of boulevards) {
      for (const street of streets) expect(boulevard.width).toBeGreaterThan(street.width);
    }
  });

  test("dangling lanes keep a cul-de-sac bulb at their dead end", () => {
    const la = resolveCityObject(
      cityVolume({ ...(CITY_SCHEMA.presets!.find((preset) => preset.id === "losangeles")!.values as Record<string, unknown>), seed: "alpha" }),
    )!;
    const bulbs = la.streets.filter((street) => street.bulb !== undefined);
    expect(bulbs.length).toBeGreaterThan(0);
    for (const street of bulbs) {
      const end = street.points[street.points.length - 1]!;
      expect(Math.hypot(street.bulb![0] - end[0], street.bulb![1] - end[1])).toBeLessThan(0.01);
    }
  });

  test("street lights and trees keep off the asphalt of every street", () => {
    const city = resolveCityObject(cityVolume({ seed: "furn", lightDensity: 0.8, treeDensity: 0.8 }))!;
    expect(city.lights.length).toBeGreaterThan(20);
    expect(city.trees.length).toBeGreaterThan(50);
    for (const light of city.lights) {
      for (const street of city.streets) {
        expect(distToStreet(street, light.x, light.z)).toBeGreaterThan(street.width / 2 - 0.6);
      }
    }
    for (const tree of city.trees) {
      for (const street of city.streets) {
        expect(distToStreet(street, tree.x, tree.z)).toBeGreaterThan(street.width / 2 - 0.6);
      }
    }
  });

  test("driveways start on their street and reach toward their lot", () => {
    const city = resolveCityObject(cityVolume({ seed: "drive" }))!;
    expect(city.driveways.length).toBeGreaterThan(10);
    for (const driveway of city.driveways) {
      expect(driveway.points.length).toBeGreaterThanOrEqual(2);
      const [sx, sz] = driveway.points[0]!;
      const nearest = Math.min(...city.streets.map((street) => distToStreet(street, sx, sz)));
      expect(nearest).toBeLessThan(8);
    }
  });

  test("furniture toggles empty their lists", () => {
    const bare = resolveCityObject(
      cityVolume({ seed: "bare", hedges: false, driveways: false, parking: false, treeDensity: 0, lightDensity: 0 }),
    )!;
    expect(bare.trees.length).toBe(0);
    expect(bare.lights.length).toBe(0);
    expect(bare.hedges.length).toBe(0);
    expect(bare.driveways.length).toBe(0);
    expect(bare.parkingLots.length).toBe(0);
  });

  test("suburbs pack tight: consistent small setbacks, rhythmic rows, occupied frontage", () => {
    // A controlled all-house district: rigid grid, flat ground, no parks, defaults for placement.
    const meta = {
      seed: "suburb",
      gridness: 1,
      curviness: 0,
      branching: 0,
      boulevards: 0,
      openSpace: 0,
      profile: "uniform",
      coreMix: [{ item: "house", weight: 1 }],
      midMix: [{ item: "house", weight: 1 }],
      edgeMix: [{ item: "house", weight: 1 }],
      roadsideOccupancy: 0.95,
      clusterStrength: 0.3,
    };
    const city = resolveCityObject(cityVolume(meta))!;
    expect(city.lots.length).toBeGreaterThan(150);
    // Front rows hug the street with a small, consistent setback: center-to-anchor distance is
    // curb + sidewalk + setback + half depth ≈ 12-13 m at defaults, and barely varies.
    const frontGaps = city.lots
      .map((lot) => Math.hypot(lot.center[0] - lot.anchor[0], lot.center[1] - lot.anchor[1]) - lot.size[1] / 2)
      .filter((gap) => gap < 14)
      .sort((a, b) => a - b);
    expect(frontGaps.length).toBeGreaterThan(city.lots.length * 0.5);
    const median = frontGaps[Math.floor(frontGaps.length / 2)]!;
    expect(median).toBeGreaterThan(6);
    expect(median).toBeLessThan(11);
    const p90 = frontGaps[Math.floor(frontGaps.length * 0.9)]!;
    expect(p90 - frontGaps[Math.floor(frontGaps.length * 0.1)]!).toBeLessThan(4.5);
    // Neighbors form rows: the median nearest-neighbor distance stays near one lot width.
    const nearest = city.lots.map((lot) => {
      let best = Infinity;
      for (const other of city.lots) {
        if (other === lot) continue;
        const d = Math.hypot(other.center[0] - lot.center[0], other.center[1] - lot.center[1]);
        if (d < best) best = d;
      }
      return best;
    });
    nearest.sort((a, b) => a - b);
    expect(nearest[Math.floor(nearest.length / 2)]!).toBeLessThan(15);
    // Most road frontage faces a building: sample stations along every street's whole arc.
    let stations = 0;
    let occupied = 0;
    for (const street of city.streets) {
      let carried = 0;
      for (let i = 0; i + 1 < street.points.length; i += 1) {
        const [ax, az] = street.points[i]!;
        const [bx, bz] = street.points[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        let d = 9 - carried;
        while (d < len) {
          const t = d / len;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          d += 9;
          if (Math.abs(x) > 170 || Math.abs(z) > 170) continue;
          stations += 1;
          for (const lot of city.lots) {
            if (Math.hypot(lot.center[0] - x, lot.center[1] - z) < 19) {
              occupied += 1;
              break;
            }
          }
        }
        carried = len - (d - 9);
      }
    }
    expect(stations).toBeGreaterThan(100);
    expect(occupied / stations).toBeGreaterThan(0.62);
  });

  test("placement dials respond: setback pushes lots back, spacing spreads them, clustering pulls toward junctions", () => {
    const base = { seed: "dials", gridness: 1, curviness: 0, openSpace: 0, coreMix: [{ item: "house", weight: 1 }], midMix: [{ item: "house", weight: 1 }], edgeMix: [{ item: "house", weight: 1 }] };
    const medianFrontGap = (meta: Record<string, unknown>): number => {
      const city = resolveCityObject(cityVolume(meta))!;
      const gaps = city.lots
        .map((lot) => Math.hypot(lot.center[0] - lot.anchor[0], lot.center[1] - lot.anchor[1]) - lot.size[1] / 2)
        .filter((gap) => gap < 25)
        .sort((a, b) => a - b);
      return gaps[Math.floor(gaps.length / 2)]!;
    };
    expect(medianFrontGap({ ...base, buildingRoadSetback: 8 })).toBeGreaterThan(medianFrontGap({ ...base, buildingRoadSetback: 0.5 }) + 4);
    const count = (meta: Record<string, unknown>): number => resolveCityObject(cityVolume(meta))!.lots.length;
    expect(count({ ...base, buildingSpacing: 0.3 })).toBeGreaterThan(count({ ...base, buildingSpacing: 8 }));
    // Clustering makes junctions centers of development: on a nearly-empty long-block district,
    // clusterStrength forms crossroad hamlets — lot count multiplies and the near-junction share
    // rises until the placeable corner band saturates.
    const clustered = (clusterStrength: number): { lots: number; nearShare: number } => {
      const city = resolveCityObject(cityVolume({ ...base, blockSize: 100, roadsideOccupancy: 0.05, clusterStrength }))!;
      let near = 0;
      for (const lot of city.lots) {
        let best = Infinity;
        for (const cross of city.intersections) best = Math.min(best, Math.hypot(cross.x - lot.center[0], cross.z - lot.center[1]));
        if (best < 32) near += 1;
      }
      return { lots: city.lots.length, nearShare: near / Math.max(1, city.lots.length) };
    };
    const uniform = clustered(0);
    const knotted = clustered(1);
    expect(knotted.lots).toBeGreaterThan(uniform.lots * 2);
    expect(knotted.nearShare).toBeGreaterThan(uniform.nearShare + 0.03);
  });

  test("parking pads never overlap building lots", () => {
    const city = resolveCityObject(cityVolume({ seed: "metro" }))!;
    expect(city.parkingLots.length).toBeGreaterThan(0);
    for (const pad of city.parkingLots) {
      for (const lot of city.lots) {
        const dx = pad.center[0] - lot.center[0];
        const dz = pad.center[1] - lot.center[1];
        if (dx * dx + dz * dz > 45 * 45) continue;
        // Cheap conservative check: centers further apart than the two half-diagonals minus slack.
        const padDiag = Math.hypot(pad.size[0], pad.size[1]) / 2;
        const lotDiag = Math.hypot(lot.size[0], lot.size[1]) / 2;
        if (Math.hypot(dx, dz) >= padDiag + lotDiag) continue;
        // Fall back to the exact SAT the generator itself uses via corner projection.
        const corners = (c: readonly [number, number], size: readonly [number, number], angle: number): [number, number][] => {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const [hw, hd] = [size[0] / 2, size[1] / 2];
          return ([[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]] as const).map(([ddx, ddz]) => [
            c[0] + ddx * cos + ddz * sin,
            c[1] - ddx * sin + ddz * cos,
          ]);
        };
        const a = corners(pad.center, pad.size, pad.rotationY);
        const b = corners(lot.center, lot.size, lot.rotationY);
        let separated = false;
        for (const angle of [pad.rotationY, lot.rotationY]) {
          for (const [axx, axz] of [
            [Math.cos(angle), -Math.sin(angle)],
            [Math.sin(angle), Math.cos(angle)],
          ] as const) {
            let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
            for (const [x, z] of a) { const p = x * axx + z * axz; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
            for (const [x, z] of b) { const p = x * axx + z * axz; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
            if (maxA < minB || maxB < minA) separated = true;
          }
        }
        expect(separated).toBe(true);
      }
    }
  });

  test("legacy buildingDensity meta still drives occupancy on old documents", () => {
    const sparse = resolveCityObject(cityVolume({ seed: "legacy", buildingDensity: 0.15 }))!;
    const dense = resolveCityObject(cityVolume({ seed: "legacy", buildingDensity: 0.95 }))!;
    expect(dense.lots.length).toBeGreaterThan(sparse.lots.length * 1.5);
  });

  test("massing pieces ride every lot and stay within its footprint envelope", () => {
    const city = resolveCityObject(cityVolume({ seed: "pieces" }))!;
    for (const lot of city.lots) {
      expect(lot.pieces.length).toBeGreaterThan(0);
      for (const piece of lot.pieces) {
        // Pieces stay inside a generous envelope around the lot (porches/awnings may overhang a little).
        expect(Math.abs(piece.offset[0]) - piece.size[0] / 2).toBeLessThan(lot.size[0]);
        expect(Math.abs(piece.offset[2]) - piece.size[2] / 2).toBeLessThan(lot.size[1]);
        expect(piece.offset[1]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
