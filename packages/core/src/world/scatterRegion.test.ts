import { describe, expect, test } from "bun:test";

import type { EditorPath } from "../editor/types";
import { flatField, noiseField } from "./terrain";
import {
  chunkScatterInstances,
  clearanceZonesFrom,
  DEFAULT_MARKER_CLEARANCE,
  distanceToPolygonEdge,
  pointInPolygon,
  polygonArea,
  readScatterRules,
  resolveScatter,
  resolveScatterRegion,
  scatterRegionEstimate,
  scatterRegionFromPath,
  SCATTER_PATH_KIND,
  type ScatterRegion,
} from "./scatterRegion";

const square: readonly [number, number][] = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
];

function region(overrides: Partial<ScatterRegion["rules"]> = {}, id = "r1"): ScatterRegion {
  return {
    id,
    polygon: square,
    rules: {
      density: 0.25,
      minSpacing: 1,
      seed: "",
      minScale: 0.8,
      maxScale: 1.2,
      minYaw: 0,
      maxYaw: Math.PI * 2,
      verticalOffset: 0,
      alignToNormal: false,
      maxSlope: 0,
      minHeight: Number.NEGATIVE_INFINITY,
      maxHeight: Number.POSITIVE_INFINITY,
      edgeFalloff: 0,
      jitter: 1,
      palette: [{ item: "grass", weight: 1 }],
      ...overrides,
    },
  };
}

describe("polygon geometry", () => {
  test("pointInPolygon distinguishes inside from outside", () => {
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([50, 50], square)).toBe(false);
  });

  test("polygonArea matches the square", () => {
    expect(polygonArea(square)).toBeCloseTo(400);
  });

  test("distanceToPolygonEdge is zero on the boundary and grows inward", () => {
    expect(distanceToPolygonEdge([10, 0], square)).toBeCloseTo(0);
    expect(distanceToPolygonEdge([0, 0], square)).toBeCloseTo(10);
  });
});

describe("resolveScatterRegion", () => {
  test("places instances inside the polygon, scaled by density", () => {
    const sparse = resolveScatterRegion(region({ density: 0.1 }));
    const dense = resolveScatterRegion(region({ density: 0.5 }));
    expect(sparse.length).toBeGreaterThan(0);
    expect(dense.length).toBeGreaterThan(sparse.length);
    for (const instance of dense) expect(pointInPolygon([instance.x, instance.z], square)).toBe(true);
  });

  test("is deterministic by seed and id", () => {
    const a = resolveScatterRegion(region({ seed: "oak" }));
    const b = resolveScatterRegion(region({ seed: "oak" }));
    expect(a.map((i) => [i.x, i.z, i.item])).toEqual(b.map((i) => [i.x, i.z, i.item]));
    const c = resolveScatterRegion(region({ seed: "pine" }));
    expect(c.map((i) => i.x)).not.toEqual(a.map((i) => i.x));
  });

  test("weighted palette mixes species and honors weights", () => {
    const instances = resolveScatterRegion(region({ density: 0.6, palette: [{ item: "tree", weight: 3 }, { item: "rock", weight: 1 }] }));
    const items = new Set(instances.map((i) => i.item));
    expect(items.has("tree")).toBe(true);
    const trees = instances.filter((i) => i.item === "tree").length;
    const rocks = instances.filter((i) => i.item === "rock").length;
    expect(trees).toBeGreaterThan(rocks);
  });

  test("grounds instances and rejects over-slope / out-of-height cells", () => {
    const terrain = noiseField({ amplitude: 6, frequency: 0.08 });
    const grounded = resolveScatterRegion(region({ density: 0.4 }), terrain);
    for (const instance of grounded) expect(instance.y).toBeCloseTo(terrain.sampleHeight(instance.x, instance.z));
    const masked = resolveScatterRegion(region({ density: 0.4, minHeight: 100 }), terrain);
    expect(masked.length).toBe(0);
  });

  test("edge falloff thins placements versus no falloff", () => {
    const full = resolveScatterRegion(region({ density: 0.5, edgeFalloff: 0 }));
    const feathered = resolveScatterRegion(region({ density: 0.5, edgeFalloff: 6 }));
    expect(feathered.length).toBeLessThan(full.length);
  });

  test("align to normal attaches a terrain normal", () => {
    const terrain = noiseField({ amplitude: 4, frequency: 0.1 });
    const instances = resolveScatterRegion(region({ density: 0.3, alignToNormal: true }), terrain);
    expect(instances[0]?.normal).toBeDefined();
  });
});

describe("scatter paths in a document", () => {
  function scatterPath(meta: Record<string, unknown>): EditorPath {
    return {
      id: "foliage_1",
      kind: SCATTER_PATH_KIND,
      points: [
        { x: -8, y: 0, z: -8 },
        { x: 8, y: 0, z: -8 },
        { x: 8, y: 0, z: 8 },
        { x: -8, y: 0, z: 8 },
      ],
      meta,
    };
  }

  test("readScatterRules fills defaults and parses palette", () => {
    const rules = readScatterRules(scatterPath({ density: 0.5, palette: [{ item: "pine", weight: 2 }] }));
    expect(rules?.density).toBe(0.5);
    expect(rules?.palette[0]?.item).toBe("pine");
    expect(readScatterRules({ id: "p", kind: "road", points: [] })).toBeNull();
  });

  test("scatterRegionEstimate reports area and count", () => {
    const estimate = scatterRegionEstimate(scatterPath({ density: 0.25 }));
    expect(estimate.area).toBeCloseTo(256);
    expect(estimate.count).toBe(Math.floor(256 * 0.25));
  });

  test("resolveScatter walks every scatter path, ignoring other paths", () => {
    const doc = {
      version: 1 as const,
      markers: [],
      volumes: [],
      paths: [scatterPath({ density: 0.4, item: "bush" }), { id: "road_1", kind: "road", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] }],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField());
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((i) => i.item === "bush")).toBe(true);
    expect(scatterRegionFromPath(doc.paths[0]!)?.polygon.length).toBe(4);
  });
});

describe("chunkScatterInstances", () => {
  const chunkPath = (meta: Record<string, unknown>): EditorPath => ({
    id: "foliage_c",
    kind: SCATTER_PATH_KIND,
    points: [
      { x: -8, y: 0, z: -8 },
      { x: 8, y: 0, z: -8 },
      { x: 8, y: 0, z: 8 },
      { x: -8, y: 0, z: 8 },
    ],
    meta,
  });

  test("buckets instances into a uniform grid, omitting empty chunks", () => {
    const doc = {
      version: 1 as const,
      markers: [],
      volumes: [],
      paths: [chunkPath({ density: 0.6, item: "tree" })],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField());
    const chunks = chunkScatterInstances(instances, 8);
    expect(chunks.length).toBeGreaterThan(0);
    // Every instance lands in exactly one chunk.
    const total = chunks.reduce((sum, chunk) => sum + chunk.instances.length, 0);
    expect(total).toBe(instances.length);
    // No empty chunks, and each instance sits inside its chunk bounds.
    for (const chunk of chunks) {
      expect(chunk.instances.length).toBeGreaterThan(0);
      for (const instance of chunk.instances) {
        expect(instance.x).toBeGreaterThanOrEqual(chunk.min[0]);
        expect(instance.x).toBeLessThan(chunk.min[0] + chunk.size);
        expect(instance.z).toBeGreaterThanOrEqual(chunk.min[1]);
        expect(instance.z).toBeLessThan(chunk.min[1] + chunk.size);
      }
    }
  });

  test("deterministic order for the same instances", () => {
    const doc = {
      version: 1 as const,
      markers: [],
      volumes: [],
      paths: [chunkPath({ density: 0.4, item: "rock" })],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField());
    const a = chunkScatterInstances(instances, 8).map((chunk) => chunk.key);
    const b = chunkScatterInstances(instances, 8).map((chunk) => chunk.key);
    expect(a).toEqual(b);
  });
});

describe("clearance zones — scatter avoid", () => {
  const fullRegion = (meta: Record<string, unknown>): EditorPath => ({
    id: "field",
    kind: SCATTER_PATH_KIND,
    points: [
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
    ].map(([x, z]) => ({ x: x!, y: 0, z: z! })),
    meta,
  });

  test("a clearance-tagged marker auto-clears foliage around it", () => {
    const doc = {
      version: 1 as const,
      markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
      volumes: [],
      paths: [fullRegion({ density: 1, minSpacing: 1 })],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField());
    expect(instances.length).toBeGreaterThan(0);
    // The solid core (radius - feather = 3.5 - 2) is fully clear; the feather band thins softly.
    for (const i of instances) expect(Math.hypot(i.x, i.z)).toBeGreaterThan(1.4);
    // And placements within the full clearance are far sparser than an equal disc far from the spawn.
    const near = instances.filter((i) => Math.hypot(i.x, i.z) <= DEFAULT_MARKER_CLEARANCE).length;
    const far = instances.filter((i) => Math.hypot(i.x - 14, i.z - 14) <= DEFAULT_MARKER_CLEARANCE).length;
    expect(near).toBeLessThan(far);
  });

  test("autoAvoid:false lets foliage return over the spawn (manual only)", () => {
    const doc = {
      version: 1 as const,
      markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
      volumes: [],
      paths: [fullRegion({ density: 1, minSpacing: 1, autoAvoid: false })],
      annotations: [],
    };
    const near = resolveScatter(doc, flatField()).filter((i) => Math.hypot(i.x, i.z) < 2);
    expect(near.length).toBeGreaterThan(0);
  });

  test("options.autoAvoid=false disables auto globally; a manual avoid zone still clears", () => {
    const doc = {
      version: 1 as const,
      markers: [{ id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
      volumes: [],
      paths: [fullRegion({ density: 1, minSpacing: 1, avoid: [{ x: 10, z: 10, radius: 5 }] })],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField(), { autoAvoid: false });
    // spawn no longer clears (auto off), but the manual zone at (10,10) does.
    expect(instances.some((i) => Math.hypot(i.x, i.z) < 2)).toBe(true);
    expect(instances.every((i) => Math.hypot(i.x - 10, i.z - 10) > 4)).toBe(true);
  });

  test("clearanceZonesFrom scopes by ids and by kinds", () => {
    const doc = {
      version: 1 as const,
      markers: [
        { id: "spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } },
        { id: "prop", kind: "prop", position: { x: 5, y: 0, z: 5 }, meta: { clearance: 4 } },
      ],
      volumes: [],
      paths: [],
      annotations: [],
    };
    // Default kinds: spawn auto-clears, prop clears via its explicit tag.
    expect(clearanceZonesFrom(doc).length).toBe(2);
    // Scoped to ids: only the prop.
    const scoped = clearanceZonesFrom(doc, { ids: ["prop"] });
    expect(scoped.length).toBe(1);
    expect(scoped[0]!.x).toBe(5);
    // Kind filter excluding spawns: only the tagged prop remains.
    expect(clearanceZonesFrom(doc, { kinds: [] }).length).toBe(1);
  });
});

describe("path corridor clearance", () => {
  test("a non-scatter path clears a clean straight corridor of foliage", () => {
    const doc = {
      version: 1 as const,
      markers: [],
      volumes: [],
      paths: [
        { id: "road", kind: "route", points: [{ x: -20, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }], width: 4, meta: { clearance: 2 } },
        {
          id: "field",
          kind: SCATTER_PATH_KIND,
          points: [
            { x: -20, y: 0, z: -20 },
            { x: 20, y: 0, z: -20 },
            { x: 20, y: 0, z: 20 },
            { x: -20, y: 0, z: 20 },
          ],
          meta: { density: 1, minSpacing: 1 },
        },
      ],
      annotations: [],
    };
    const instances = resolveScatter(doc, flatField());
    expect(instances.length).toBeGreaterThan(0);
    // Corridor half-width = 4/2 + 2 = 4; nothing lands within the solid core (halfWidth - feather 2 = 2) of z=0.
    const inCore = instances.filter((i) => Math.abs(i.x) <= 18 && Math.abs(i.z) < 1.9);
    expect(inCore.length).toBe(0);
    // Foliage still fills away from the corridor.
    expect(instances.some((i) => Math.abs(i.z) > 8)).toBe(true);
  });
});
