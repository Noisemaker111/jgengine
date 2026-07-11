import { describe, expect, test } from "bun:test";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { createSpatialApi, distanceBetween } from "@jgengine/core/scene/spatial";

function apiFrom(positions: Record<string, EntityPosition>, occluder?: (from: EntityPosition, to: EntityPosition) => boolean) {
  return createSpatialApi({
    resolvePosition: (instanceId) => positions[instanceId],
    candidates: () => Object.keys(positions),
    ...(occluder !== undefined ? { occluder } : {}),
  });
}

describe("spatial", () => {
  test("distanceBetween measures euclidean distance", () => {
    expect(distanceBetween([0, 0, 0], [3, 4, 0])).toBe(5);
  });

  test("distance resolves ids and returns null for unknowns", () => {
    const api = apiFrom({ a: [0, 0, 0], b: [0, 0, 10] });
    expect(api.distance("a", "b")).toBe(10);
    expect(api.distance("a", "missing")).toBeNull();
  });

  test("inRadius accepts a position or an id center and excludes the center entity", () => {
    const api = apiFrom({ a: [0, 0, 0], b: [3, 0, 0], c: [50, 0, 0] });
    expect(api.inRadius([0, 0, 0], 5)).toEqual(["a", "b"]);
    expect(api.inRadius("a", 5)).toEqual(["b"]);
  });

  test("inRadius applies the filter predicate", () => {
    const api = apiFrom({ a: [0, 0, 0], b: [1, 0, 0], c: [2, 0, 0] });
    expect(api.inRadius([0, 0, 0], 5, (id) => id !== "b")).toEqual(["a", "c"]);
  });

  test("hasLineOfSight defaults to true without an occluder (open-field bypass)", () => {
    const open = apiFrom({ a: [0, 0, 0], b: [0, 0, 10] });
    expect(open.hasLineOfSight("a", "b")).toBe(true);
    expect(open.hasLineOfSight("a", "missing")).toBe(false);
  });

  test("hasLineOfSight is blocked when the occluder reports a wall", () => {
    const walled = apiFrom({ a: [0, 0, 0], b: [0, 0, 10] }, () => true);
    expect(walled.hasLineOfSight("a", "b")).toBe(false);
    const gated = apiFrom({ a: [0, 0, 0], b: [0, 0, 10], c: [10, 0, 0] }, (from, to) => {
      return from[2] === 0 && to[2] === 10;
    });
    expect(gated.hasLineOfSight("a", "b")).toBe(false);
    expect(gated.hasLineOfSight("a", "c")).toBe(true);
  });

  test("queryArc returns candidates inside the XZ cone", () => {
    const api = apiFrom({
      attacker: [0, 0, 0],
      ahead: [0, 0, 2],
      behind: [0, 0, -2],
      wide: [2, 0, 0.1],
      far: [0, 0, 20],
    });
    const hits = api.queryArc({ from: "attacker", aim: { yaw: 0, pitch: 0 }, radius: 3 });
    expect(hits).toEqual(["ahead"]);
  });

  test("queryArc supports origin and direction aim and honors halfAngleDeg", () => {
    const api = apiFrom({ attacker: [0, 0, 0], side: [2, 0, 2] });
    const aim = { origin: [0, 0, 0] as EntityPosition, direction: [0, 0, 1] as EntityPosition };
    expect(api.queryArc({ from: "attacker", aim, radius: 5, halfAngleDeg: 30 })).toEqual([]);
    expect(api.queryArc({ from: "attacker", aim, radius: 5, halfAngleDeg: 50 })).toEqual(["side"]);
  });

  test("moveToward steps by speed * dt and stops at stopDistance", () => {
    const api = apiFrom({ chaser: [0, 0, 0], prey: [0, 0, 10] });
    expect(api.moveToward("chaser", "prey", { speed: 2, dt: 0.5 })).toEqual([0, 0, 1]);
    expect(api.moveToward("chaser", [0, 0, 10], { speed: 100, dt: 1, stopDistance: 4 })).toEqual([0, 0, 6]);
    expect(api.moveToward("chaser", [0, 0, 1], { speed: 5, dt: 1, stopDistance: 2 })).toEqual([0, 0, 0]);
    expect(api.moveToward("missing", "prey", { speed: 1, dt: 1 })).toBeNull();
  });

  function seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  function randomPositions(count: number, rng: () => number, spread: number): Record<string, EntityPosition> {
    const positions: Record<string, EntityPosition> = {};
    for (let i = 0; i < count; i += 1) {
      positions[`entity-${i}`] = [
        (rng() - 0.5) * spread,
        (rng() - 0.5) * spread,
        (rng() - 0.5) * spread,
      ];
    }
    return positions;
  }

  describe("grid acceleration", () => {
    test("grid is on by default and matches an explicit linear scan", () => {
      const rng = seededRandom(42);
      const positions = randomPositions(200, rng, 100);
      const ids = () => Object.keys(positions);
      const linear = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: ids,
        grid: false,
      });
      const gridded = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: ids,
      });
      for (let trial = 0; trial < 25; trial += 1) {
        const center: EntityPosition = [(rng() - 0.5) * 100, (rng() - 0.5) * 100, (rng() - 0.5) * 100];
        const radius = rng() * 30;
        expect(gridded.inRadius(center, radius).sort()).toEqual(linear.inRadius(center, radius).sort());
      }
    });

    test("queryArc matches the linear scan for random point sets", () => {
      const rng = seededRandom(7);
      const positions = randomPositions(150, rng, 80);
      positions["attacker"] = [0, 0, 0];
      const ids = () => Object.keys(positions);
      const linear = createSpatialApi({ resolvePosition: (id) => positions[id], candidates: ids, grid: false });
      const gridded = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: ids,
        grid: { cellSize: 4 },
      });
      for (let trial = 0; trial < 15; trial += 1) {
        const aim = { yaw: rng() * Math.PI * 2, pitch: 0 };
        const radius = rng() * 40;
        const options = { from: "attacker", aim, radius, halfAngleDeg: 45 };
        expect(gridded.queryArc(options).sort()).toEqual(linear.queryArc(options).sort());
      }
    });

    test("invalidate() picks up a moved entity that would otherwise be stale", () => {
      const positions: Record<string, EntityPosition> = { a: [0, 0, 0], b: [100, 0, 100] };
      const api = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: () => Object.keys(positions),
        grid: { cellSize: 5 },
      });
      expect(api.inRadius([50, 50, 50], 10)).toEqual([]);
      positions["b"] = [51, 50, 51];
      expect(api.inRadius([50, 50, 50], 10)).toEqual([]);
      api.invalidate();
      expect(api.inRadius([50, 50, 50], 10)).toEqual(["b"]);
    });

    test("getVersion auto-rebuilds after a move without invalidate()", () => {
      const positions: Record<string, EntityPosition> = { a: [0, 0, 0], b: [100, 0, 100] };
      let version = 0;
      const api = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: () => Object.keys(positions),
        grid: { cellSize: 5 },
        getVersion: () => version,
      });
      expect(api.inRadius([50, 50, 50], 10)).toEqual([]);
      positions["b"] = [51, 50, 51];
      version += 1;
      expect(api.inRadius([50, 50, 50], 10)).toEqual(["b"]);
    });

    test("a newly added candidate is never missed even without invalidate()", () => {
      const positions: Record<string, EntityPosition> = { a: [0, 0, 0] };
      const api = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates: () => Object.keys(positions),
        grid: { cellSize: 5 },
      });
      expect(api.inRadius([50, 50, 50], 10)).toEqual([]);
      positions["b"] = [51, 50, 51];
      expect(api.inRadius([50, 50, 50], 10)).toEqual(["b"]);
    });

    test("grid-backed inRadius is faster than a full linear scan at scale", () => {
      const rng = seededRandom(99);
      const positions = randomPositions(4000, rng, 400);
      const ids = Object.keys(positions);
      const candidates = () => ids;
      const linear = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates,
        grid: false,
      });
      const gridded = createSpatialApi({
        resolvePosition: (id) => positions[id],
        candidates,
        grid: { cellSize: 8 },
      });
      const center: EntityPosition = [0, 0, 0];
      const radius = 12;
      gridded.inRadius(center, radius);
      const t0 = performance.now();
      for (let i = 0; i < 40; i += 1) linear.inRadius(center, radius);
      const linearMs = performance.now() - t0;
      const t1 = performance.now();
      for (let i = 0; i < 40; i += 1) gridded.inRadius(center, radius);
      const gridMs = performance.now() - t1;
      expect(gridMs).toBeLessThan(linearMs);
      expect(gridded.inRadius(center, radius).sort()).toEqual(linear.inRadius(center, radius).sort());
    });
  });
});
