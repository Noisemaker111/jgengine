import { describe, expect, test } from "bun:test";
import { computeFlowField, createCrowdField, selectPoi, spreadOffset, type Poi } from "@jgengine/core/ai/crowd";
import { createNavGrid, findPath, type NavPoint } from "@jgengine/core/nav/navGrid";

function openGrid(size = 20) {
  return createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: size, maxZ: size }, cellSize: 1 });
}

describe("flow field", () => {
  test("cost rises with distance from the goal and steers toward it", () => {
    const grid = openGrid();
    const goal: NavPoint = [18, 18];
    const field = computeFlowField(grid, [goal]);
    const near = field.cost(...cellOf(grid, [17, 18]));
    const far = field.cost(...cellOf(grid, [2, 2]));
    expect(far).toBeGreaterThan(near);
    const dir = field.direction([2, 2]);
    expect(dir[0]).toBeGreaterThan(0);
    expect(dir[1]).toBeGreaterThan(0);
  });

  test("agents at the goal have no direction", () => {
    const grid = openGrid();
    const field = computeFlowField(grid, [[18, 18]]);
    expect(field.direction([18, 18])).toEqual([0, 0]);
    expect(field.next([18, 18])).toBeNull();
  });

  test("walls behind an obstacle are unreachable", () => {
    const grid = openGrid();
    grid.blockAabb({ minX: 5, minZ: 0, maxX: 6, maxZ: 20 });
    const field = computeFlowField(grid, [[18, 10]]);
    expect(field.reachable([2, 10])).toBe(false);
    expect(field.reachable([15, 10])).toBe(true);
  });

  test("routes around obstacles like findPath", () => {
    const grid = openGrid();
    grid.blockAabb({ minX: 10, minZ: 0, maxX: 11, maxZ: 15 });
    const goal: NavPoint = [18, 5];
    const field = computeFlowField(grid, [goal]);
    let point: NavPoint = [2, 5];
    let steps = 0;
    for (; steps < 200; steps += 1) {
      const next = field.next(point);
      if (next === null) break;
      point = next;
    }
    expect(Math.hypot(point[0] - goal[0], point[1] - goal[1])).toBeLessThan(2);
    expect(findPath(grid, [2, 5], goal)).not.toBeNull();
  });
});

describe("crowd congestion", () => {
  test("occupancy counts agents per cell", () => {
    const grid = openGrid();
    const crowd = createCrowdField(grid);
    crowd.enter([3, 3]);
    crowd.enter([3, 3]);
    expect(crowd.count([3, 3])).toBe(2);
    crowd.leave([3, 3]);
    expect(crowd.count([3, 3])).toBe(1);
  });

  test("congestion penalty diverts the flow field around a crowded corridor", () => {
    const grid = openGrid(9);
    grid.blockAabb({ minX: 0, minZ: 3, maxX: 3, maxZ: 4 });
    grid.blockAabb({ minX: 5, minZ: 3, maxX: 9, maxZ: 4 });
    const goal: NavPoint = [4, 8];
    const start: NavPoint = [4, 0];
    const crowd = createCrowdField(grid);
    for (let i = 0; i < 40; i += 1) crowd.enter([4, 3]);
    const clear = computeFlowField(grid, [goal]);
    const jammed = computeFlowField(grid, [goal], { congestion: crowd.penalty(50) });
    expect(jammed.cost(...cellOf(grid, start))).toBeGreaterThan(clear.cost(...cellOf(grid, start)));
  });
});

describe("POI selection", () => {
  const pois: Poi[] = [
    { id: "near", point: [2, 0], appeal: 1 },
    { id: "far", point: [40, 0], appeal: 1 },
  ];

  test("proximity bias favours nearer POIs", () => {
    let nearHits = 0;
    for (let roll = 0; roll < 1; roll += 0.05) {
      const poi = selectPoi(pois, [0, 0], { roll, distanceBias: 2 });
      if (poi?.id === "near") nearHits += 1;
    }
    expect(nearHits).toBeGreaterThan(12);
  });

  test("full POIs are skipped by capacity", () => {
    const capped: Poi[] = [{ id: "seat-a", point: [2, 0], capacity: 1 }, { id: "seat-b", point: [3, 0] }];
    const poi = selectPoi(capped, [0, 0], { roll: 0, occupancy: (id) => (id === "seat-a" ? 1 : 0) });
    expect(poi?.id).toBe("seat-b");
  });

  test("distance override routes over the navmesh via findPath", () => {
    const grid = openGrid();
    grid.blockAabb({ minX: 4, minZ: 0, maxX: 5, maxZ: 18 });
    const walled: Poi[] = [
      { id: "behind-wall", point: [2, 2] },
      { id: "open", point: [15, 2] },
    ];
    const pathLength = (from: NavPoint, poi: Poi): number => {
      const route = findPath(grid, from, poi.point);
      if (route === null) return Number.POSITIVE_INFINITY;
      let length = 0;
      for (let i = 1; i < route.length; i += 1) {
        length += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
      }
      return length;
    };
    const poi = selectPoi(walled, [10, 2], { roll: 0.5, distanceBias: 3, distance: pathLength });
    expect(poi?.id).toBe("open");
  });

  test("returns null when every POI is full", () => {
    const capped: Poi[] = [{ id: "seat", point: [1, 0], capacity: 1 }];
    expect(selectPoi(capped, [0, 0], { roll: 0.5, occupancy: () => 1 })).toBeNull();
  });
});

describe("spreadOffset", () => {
  test("is stable per id and stays within the disc", () => {
    const a = spreadOffset("guard-7", 5);
    const b = spreadOffset("guard-7", 5);
    expect(a).toEqual(b);
    expect(Math.hypot(a[0], a[1])).toBeLessThanOrEqual(5 + 1e-9);
  });

  test("different ids fan out to different offsets", () => {
    const a = spreadOffset("guard-1", 5);
    const b = spreadOffset("guard-2", 5);
    expect(a).not.toEqual(b);
  });

  test("collapses to the origin at radius 0", () => {
    const o = spreadOffset("x", 0);
    expect(Math.hypot(o[0], o[1])).toBe(0);
  });
});

function cellOf(grid: ReturnType<typeof createNavGrid>, point: NavPoint): [number, number] {
  const cell = grid.cellAt(point);
  return [cell.col, cell.row];
}
