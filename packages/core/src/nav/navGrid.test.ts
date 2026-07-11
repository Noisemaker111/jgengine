import { describe, expect, test } from "bun:test";
import { createNavGrid, findPath, slopeStepCost, smoothPath, type NavPoint } from "@jgengine/core/nav/navGrid";

const BOUNDS = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };

describe("navGrid", () => {
  test("maps world points to cells and back to centers", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    expect(grid.cols).toBe(10);
    expect(grid.rows).toBe(10);
    expect(grid.cellAt([2.4, 3.6])).toEqual({ col: 2, row: 3 });
    expect(grid.center(2, 3)).toEqual([2.5, 3.5]);
  });

  test("clamps out-of-bounds points into the grid", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    expect(grid.cellAt([-5, 99])).toEqual({ col: 0, row: 9 });
  });

  test("blockAabb marks overlapping cells unwalkable", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    grid.blockAabb({ minX: 3, minZ: 3, maxX: 4, maxZ: 4 });
    expect(grid.isWalkable(3, 3)).toBe(false);
    expect(grid.isWalkable(0, 0)).toBe(true);
  });

  test("findPath returns a straight route on an empty grid", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    const path = findPath(grid, [0.5, 0.5], [9.5, 0.5]);
    expect(path).not.toBeNull();
    const end = path![path!.length - 1]!;
    expect(end[0]).toBeCloseTo(9.5);
    expect(end[1]).toBeCloseTo(0.5);
  });

  test("findPath routes around a blocking wall", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 7, maxZ: 7 }, cellSize: 1 });
    for (let row = 0; row < 6; row += 1) grid.setWalkable(3, row, false);
    const path = findPath(grid, [0.5, 0.5], [6.5, 0.5], { smooth: false });
    expect(path).not.toBeNull();
    const crossesWall = path!.some((point) => grid.cellAt(point).col === 3 && grid.cellAt(point).row < 6);
    expect(crossesWall).toBe(false);
    const passesGap = path!.some((point) => grid.cellAt(point).row === 6);
    expect(passesGap).toBe(true);
  });

  test("findPath returns null when a full-height wall divides start from goal", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 5, maxZ: 5 }, cellSize: 1 });
    for (let row = 0; row < 5; row += 1) grid.setWalkable(2, row, false);
    expect(findPath(grid, [0.5, 0.5], [4.5, 4.5])).toBeNull();
  });

  test("goal on an obstacle snaps to the nearest walkable cell", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    grid.blockAabb({ minX: 5, minZ: 5, maxX: 6, maxZ: 6 });
    const path = findPath(grid, [0.5, 0.5], [5.5, 5.5]);
    expect(path).not.toBeNull();
  });

  test("smoothPath collapses a diagonal staircase to two points", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    const stair: NavPoint[] = [
      [0.5, 0.5],
      [1.5, 0.5],
      [1.5, 1.5],
      [2.5, 1.5],
      [2.5, 2.5],
    ];
    const smoothed = smoothPath(grid, stair);
    expect(smoothed.length).toBeLessThan(stair.length);
    expect(smoothed[0]).toEqual([0.5, 0.5]);
    expect(smoothed[smoothed.length - 1]).toEqual([2.5, 2.5]);
  });

  test("lineOfSight is blocked by an obstacle between two points", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    expect(grid.lineOfSight([0.5, 0.5], [4.5, 0.5])).toBe(true);
    grid.setWalkable(2, 0, false);
    expect(grid.lineOfSight([0.5, 0.5], [4.5, 0.5])).toBe(false);
  });

  test("supercover LoS rejects corner-cutting diagonals", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    grid.setWalkable(1, 0, false);
    grid.setWalkable(0, 1, false);
    expect(grid.lineOfSight([0.5, 0.5], [1.5, 1.5])).toBe(false);
    grid.setWalkable(1, 0, true);
    grid.setWalkable(0, 1, true);
    expect(grid.lineOfSight([0.5, 0.5], [1.5, 1.5])).toBe(true);
  });

  test("smoothPath does not string-pull through a blocked corner", () => {
    const grid = createNavGrid({ bounds: BOUNDS, cellSize: 1 });
    grid.setWalkable(1, 0, false);
    grid.setWalkable(0, 1, false);
    const stair: NavPoint[] = [
      [0.5, 0.5],
      [0.5, 1.5],
      [1.5, 1.5],
    ];
    const smoothed = smoothPath(grid, stair);
    expect(smoothed.length).toBe(3);
  });

  test("findPath clearance snaps start/goal only onto pad-clear cells", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 12, maxZ: 12 }, cellSize: 1 });
    for (let col = 0; col < 12; col += 1) grid.setWalkable(col, 0, false);
    for (let col = 0; col < 12; col += 1) grid.setWalkable(col, 11, false);
    const path = findPath(grid, [0.5, 0.5], [11.5, 11.5], { clearance: 2, smooth: false });
    expect(path).not.toBeNull();
    const pad = Math.max(0, Math.ceil(2 / grid.cellSize / 2));
    for (const point of path!) {
      const cell = grid.cellAt(point);
      for (let dy = -pad; dy <= pad; dy += 1) {
        for (let dx = -pad; dx <= pad; dx += 1) {
          expect(grid.isWalkable(cell.col + dx, cell.row + dy)).toBe(true);
        }
      }
    }
  });

  test("clearance fallback never seeds a pad-failing cell", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, cellSize: 1 });
    grid.setWalkable(5, 5, false);
    const path = findPath(grid, [5.5, 5.5], [0.5, 0.5], { clearance: 2, smooth: false });
    expect(path).not.toBeNull();
    const start = grid.cellAt(path![0]!);
    const chebyshev = Math.max(Math.abs(start.col - 5), Math.abs(start.row - 5));
    expect(chebyshev).toBeGreaterThan(1);
  });

  test("stepCost penalizes a steep ridge, routing a detour around it", () => {
    const grid = createNavGrid({ bounds: { minX: 0, minZ: 0, maxX: 9, maxZ: 5 }, cellSize: 1, diagonal: false });
    const field = {
      sampleHeight: (x: number, z: number): number => {
        const col = Math.floor(x);
        const row = Math.floor(z);
        return col === 4 && row !== 4 ? 20 : 0;
      },
    };
    const crossesRidge = (path: NavPoint[]) =>
      path.some((point) => {
        const cell = grid.cellAt(point);
        return cell.col === 4 && cell.row !== 4;
      });

    const direct = findPath(grid, [0.5, 2.5], [8.5, 2.5], { smooth: false });
    expect(direct).not.toBeNull();
    expect(crossesRidge(direct!)).toBe(true);

    const detoured = findPath(grid, [0.5, 2.5], [8.5, 2.5], { smooth: false, stepCost: slopeStepCost(field) });
    expect(detoured).not.toBeNull();
    expect(crossesRidge(detoured!)).toBe(false);
  });

  test("slopeStepCost is 1 on flat ground and grows with rise over run", () => {
    const flat = { sampleHeight: () => 0 };
    const cost = slopeStepCost(flat);
    expect(cost([0, 0], [1, 0])).toBe(1);

    const ramp = { sampleHeight: (x: number) => x };
    const steep = slopeStepCost(ramp)([0, 0], [1, 0]);
    expect(steep).toBeCloseTo(2, 6);
  });
});
