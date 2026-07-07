import { describe, expect, test } from "bun:test";
import { buildingIndex } from "./buildingIndex";
import type { GeneratedBuilding } from "./buildings";
import type { Vec2 } from "./geometry";

function makeBuilding(id: string, center: Vec2, halfW: number, halfD: number): GeneratedBuilding {
  return {
    id,
    seed: id,
    center,
    footprint: { w: halfW * 2, d: halfD * 2 },
    floors: 3,
    floorHeight: 2.8,
    bounds: {
      minX: center[0] - halfW,
      maxX: center[0] + halfW,
      minZ: center[1] - halfD,
      maxZ: center[1] + halfD,
    },
    parts: [],
  };
}

describe("buildingIndex", () => {
  const a = makeBuilding("a", [0, 0], 2, 2);
  const b = makeBuilding("b", [10, 0], 2, 2);
  const overlapping = makeBuilding("overlap", [1, 0], 4, 4);
  const index = buildingIndex([a, b, overlapping]);

  test("at returns containing building and picks nearest center on overlap", () => {
    expect(index.at([1, 0])?.id).toBe("overlap");
    expect(index.at([0, 0])?.id).toBe("a");
    expect(index.at([100, 100])).toBeUndefined();
  });

  test("within returns overlapping set", () => {
    const hits = index.within({ minX: -3, maxX: -1, minZ: -3, maxZ: 3 });
    expect(hits.map((h) => h.id).sort()).toEqual(["a", "overlap"]);
    expect(index.within({ minX: 8, maxX: 12, minZ: -1, maxZ: 1 }).map((h) => h.id)).toEqual(["b"]);
  });

  test("nearest returns closest by center with correct distance", () => {
    const hit = index.nearest([10, 0]);
    expect(hit?.building.id).toBe("b");
    expect(hit?.distance).toBe(0);
    const diagonal = index.nearest([13, 4]);
    expect(diagonal?.building.id).toBe("b");
    expect(diagonal?.distance).toBeCloseTo(5, 10);
  });

  test("isInside true inside a footprint, false outside all", () => {
    expect(index.isInside([0, 0])).toBe(true);
    expect(index.isInside([100, 100])).toBe(false);
  });

  test("blockers expands by margin", () => {
    expect(index.blockers()[0]).toEqual(a.bounds);
    expect(index.blockers(1)[0]).toEqual({ minX: -3, maxX: 3, minZ: -3, maxZ: 3 });
  });

  test("bounds is the union of all building bounds", () => {
    expect(index.bounds).toEqual({ minX: -3, maxX: 12, minZ: -4, maxZ: 4 });
  });

  test("empty index has undefined queries and empty collections", () => {
    const empty = buildingIndex([]);
    expect(empty.at([0, 0])).toBeUndefined();
    expect(empty.nearest([0, 0])).toBeUndefined();
    expect(empty.bounds).toBeUndefined();
    expect(empty.within({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 })).toEqual([]);
    expect(empty.blockers()).toEqual([]);
    expect(empty.isInside([0, 0])).toBe(false);
  });
});
