import { describe, expect, test } from "bun:test";

import { interiorWallRuns, nearestFixtures, planInteriorDressing, type InteriorRect } from "./interiorDressing";

// An L of two rooms joined along x = 4: a 8 x 6 hall and a 4 x 10 wing that shares part of its edge.
const HALL: InteriorRect = { x: 0, z: 0, w: 8, d: 6 };
const WING: InteriorRect = { x: 6, z: 2, w: 4, d: 10 };

describe("interiorWallRuns", () => {
  test("a single room has four runs, each facing inward", () => {
    const runs = interiorWallRuns([HALL]);
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      const mid = [(run.from[0] + run.to[0]) / 2 + run.inward[0] * 0.5, (run.from[1] + run.to[1]) / 2 + run.inward[1] * 0.5];
      expect(Math.abs(mid[0]!) < 4 && Math.abs(mid[1]!) < 3).toBe(true);
    }
    expect(runs.reduce((sum, run) => sum + run.length, 0)).toBeCloseTo(28);
  });

  test("the doorway where two rooms touch leaves no wall, and collinear edges merge", () => {
    const runs = interiorWallRuns([HALL, WING]);
    // Hall's east edge x=4 is open to the wing for z -3..3; only the wing's own west wall (z 3..7) stands there.
    const atFour = runs.filter((run) => run.from[0] === 4 && run.to[0] === 4);
    expect(atFour.map((run) => [Math.min(run.from[1], run.to[1]), Math.max(run.from[1], run.to[1])])).toEqual([[3, 7]]);
    // The south edge z=-3 runs uninterrupted from x=-4 to x=8 across both rooms.
    const south = runs.find((run) => run.from[1] === -3 && run.to[1] === -3);
    expect(south?.length).toBeCloseTo(12);
    expect(south?.inward).toEqual([0, 1]);
    const perimeter = runs.reduce((sum, run) => sum + run.length, 0);
    expect(perimeter).toBeCloseTo(12 + 6 + 4 + 10 + 8 + 4);
  });

  test("rejects a degenerate footprint", () => {
    expect(() => interiorWallRuns([{ x: 0, z: 0, w: 0, d: 4 }])).toThrow();
  });
});

describe("planInteriorDressing", () => {
  const options = { seed: "test", floorY: 0, ceilingY: 4 };

  test("is deterministic for a seed and changes with it", () => {
    const a = planInteriorDressing([HALL, WING], options);
    const b = planInteriorDressing([HALL, WING], options);
    const c = planInteriorDressing([HALL, WING], { ...options, seed: "other" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  test("places every family with its defaults, inside the room and under the ceiling", () => {
    const plan = planInteriorDressing([HALL, WING], options);
    expect(plan.trims.filter((trim) => trim.role === "skirting")).toHaveLength(plan.walls.length);
    expect(plan.pipes.length).toBeGreaterThan(0);
    expect(plan.fittings.some((fitting) => fitting.role === "bracket")).toBe(true);
    expect(plan.cables.length).toBeGreaterThan(0);
    expect(plan.decals.some((decal) => decal.style === "grime")).toBe(true);
    expect(plan.decals.some((decal) => decal.surface === "floor")).toBe(true);
    expect(plan.fixtures.length).toBeGreaterThan(0);
    expect(plan.clutter.length).toBeGreaterThan(0);
    for (const pipe of plan.pipes) for (const end of [pipe.from, pipe.to]) {
      expect(end[1]).toBeLessThan(4);
      expect(end[1]).toBeGreaterThan(0);
    }
    for (const cable of plan.cables) {
      expect(cable.points.length).toBe(11);
      const lowest = Math.min(...cable.points.map((point) => point[1]));
      expect(lowest).toBeLessThan(cable.points[0]![1]);
    }
  });

  test("clutter keeps a walkway open and never covers a kept-clear spot", () => {
    const keep = { x: 0, z: -2.5, radius: 1.5 };
    const plan = planInteriorDressing([HALL, WING], { ...options, keepClear: [keep], clutter: { spacing: 1, chance: 1 } });
    expect(plan.clutter.length).toBeGreaterThan(0);
    for (const slot of plan.clutter) {
      expect(Math.hypot(slot.position[0] - keep.x, slot.position[2] - keep.z)).toBeGreaterThan(keep.radius);
    }
    // A corridor too narrow for depth + passage gets no clutter at all.
    const corridor = planInteriorDressing([{ x: 0, z: 0, w: 2, d: 12 }], { ...options, clutter: { chance: 1 } });
    expect(corridor.clutter).toHaveLength(0);
  });

  test("every family can be turned off", () => {
    const plan = planInteriorDressing([HALL], { ...options, trims: false, pipes: false, cables: false, decals: false, fixtures: false, clutter: false });
    expect(plan.walls).toHaveLength(4);
    expect([plan.trims, plan.pipes, plan.fittings, plan.cables, plan.decals, plan.fixtures, plan.clutter].every((list) => list.length === 0)).toBe(true);
  });

  test("refuses a ceiling below the floor", () => {
    expect(() => planInteriorDressing([HALL], { seed: 1, floorY: 2, ceilingY: 2.5 })).toThrow();
  });
});

test("nearestFixtures picks the closest lamps within reach, nearest first", () => {
  const lamps = [{ id: "a", light: [0, 2, 0] as [number, number, number] }, { id: "b", light: [5, 2, 0] as [number, number, number] }, { id: "c", light: [20, 2, 0] as [number, number, number] }];
  expect(nearestFixtures(lamps, [4, 2, 0], 2).map((lamp) => lamp.id)).toEqual(["b", "a"]);
  expect(nearestFixtures(lamps, [4, 2, 0], 5, 10).map((lamp) => lamp.id)).toEqual(["b", "a"]);
  expect(nearestFixtures(lamps, [4, 2, 0], 0)).toEqual([]);
});
