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

  test("hasLineOfSight defaults to true and delegates to the occluder", () => {
    const open = apiFrom({ a: [0, 0, 0], b: [0, 0, 10] });
    expect(open.hasLineOfSight("a", "b")).toBe(true);
    expect(open.hasLineOfSight("a", "missing")).toBe(false);

    const walled = apiFrom({ a: [0, 0, 0], b: [0, 0, 10] }, () => true);
    expect(walled.hasLineOfSight("a", "b")).toBe(false);
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
});
