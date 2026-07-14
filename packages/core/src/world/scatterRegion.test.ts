import { describe, expect, test } from "bun:test";

import type { EditorPath } from "../editor/types";
import { flatField, noiseField } from "./terrain";
import {
  chunkScatterInstances,
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
