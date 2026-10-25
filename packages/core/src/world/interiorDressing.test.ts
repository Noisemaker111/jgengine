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
    for (const cable of plan.cables.filter((entry) => !entry.id.endsWith(":floor-cable"))) {
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
    const plan = planInteriorDressing([HALL], { ...options, trims: false, pipes: false, cables: false, decals: false, fixtures: false, clutter: false, panels: false, debris: false });
    expect(plan.walls).toHaveLength(4);
    expect([plan.trims, plan.pipes, plan.fittings, plan.cables, plan.decals, plan.fixtures, plan.clutter, plan.panels, plan.debris].every((list) => list.length === 0)).toBe(true);
  });

  test("the newer families leave an existing plan's pipes, cables, stains and clutter where they were", () => {
    const full = planInteriorDressing([HALL, WING], options);
    const bare = planInteriorDressing([HALL, WING], { ...options, panels: false, debris: false, cables: { floor: 0 }, decals: { paper: 0, scorch: 0 } });
    expect(bare.pipes).toEqual(full.pipes);
    expect(bare.clutter).toEqual(full.clutter);
    expect(bare.cables).toEqual(full.cables.filter((cable) => !cable.id.endsWith(":floor-cable")));
    // Floor stains stack a hair apart in height by order, so compare where they lie on the floor.
    const flat = (list: typeof full.decals) => list.map((decal) => ({ ...decal, position: [decal.position[0], 0, decal.position[2]] }));
    expect(flat(bare.decals)).toEqual(flat(full.decals.filter((decal) => decal.style !== "paper" && decal.style !== "scorch")));
  });

  test("walls break up into wainscot plates and hatches that sit on the wall, inside the room", () => {
    const plan = planInteriorDressing([HALL, WING], { ...options, panels: { chance: 1, hatches: 1 } });
    const plates = plan.panels.filter((panel) => panel.role === "panel");
    expect(plates.length).toBeGreaterThan(plan.walls.length);
    expect(plan.panels.some((panel) => panel.role === "hatch")).toBe(true);
    for (const panel of plan.panels) {
      expect(panel.center[1] - panel.size[1] / 2).toBeGreaterThanOrEqual(0);
      expect(panel.center[1] + panel.size[1] / 2).toBeLessThan(4);
    }
    expect(planInteriorDressing([HALL], { ...options, panels: { chance: 0, hatches: 0 } }).panels).toHaveLength(0);
  });

  test("debris hugs walls, piles in inside corners, lies in the open and never on a kept-clear spot", () => {
    const keep = { x: 0, z: 0, radius: 1.2 };
    const plan = planInteriorDressing([HALL, WING], { ...options, keepClear: [keep], debris: { wall: 1, corners: 3, open: 0.2 } });
    const kinds = new Set(plan.debris.map((slot) => slot.along));
    expect([...kinds].sort()).toEqual(["corner", "open", "wall"]);
    for (const slot of plan.debris) {
      expect(Math.hypot(slot.position[0] - keep.x, slot.position[2] - keep.z)).toBeGreaterThan(keep.radius);
      const inHall = Math.abs(slot.position[0]) < 4 && Math.abs(slot.position[2]) < 3;
      const inWing = Math.abs(slot.position[0] - 6) < 2 && Math.abs(slot.position[2] - 2) < 5;
      expect(inHall || inWing).toBe(true);
    }
    // The hall's south-west corner is an inside corner; the doorway edge at (4, 3) is not one.
    const corners = plan.debris.filter((slot) => slot.along === "corner");
    expect(corners.some((slot) => slot.position[0] < -3 && slot.position[2] < -2)).toBe(true);
  });

  test("density scales how lived-in a floor is, from bare to wrecked", () => {
    const count = (density: number) => {
      const plan = planInteriorDressing([HALL, WING], { ...options, density });
      return plan.decals.length + plan.debris.length;
    };
    expect(count(0)).toBe(0);
    expect(count(2)).toBeGreaterThan(count(1));
    expect(count(1)).toBeGreaterThan(count(0.5));
    expect(() => planInteriorDressing([HALL], { ...options, density: -1 })).toThrow();
  });

  test("some lamps are dead or flicker, and a marked clearance gets hazard stripes", () => {
    const plan = planInteriorDressing([{ x: 0, z: 0, w: 60, d: 40 }], { ...options, keepClear: [{ x: 0, z: 0, radius: 2, mark: true }], fixtures: { spacing: 3, dead: 0.3, flicker: 0.2 } });
    const states = plan.fixtures.map((fixture) => fixture.state);
    expect(states).toContain("dead");
    expect(states).toContain("flicker");
    expect(states.filter((state) => state === "lit").length).toBeGreaterThan(states.length / 3);
    const hazard = plan.decals.filter((decal) => decal.style === "hazard");
    expect(hazard).toHaveLength(1);
    expect(hazard[0]!.width).toBeCloseTo(4.3);
    const steady = planInteriorDressing([HALL], { ...options, fixtures: { dead: 0, flicker: 0 } });
    expect(steady.fixtures.every((fixture) => fixture.state === "lit")).toBe(true);
  });

  test("a floor cable drops from the ceiling and lies along the foot of its wall", () => {
    const plan = planInteriorDressing([HALL], { ...options, cables: { chance: 0, floor: 1 } });
    const floor = plan.cables.filter((cable) => cable.id.endsWith(":floor-cable"));
    expect(floor).toHaveLength(4);
    for (const cable of floor) {
      expect(cable.points[0]![1]).toBeGreaterThan(3);
      expect(cable.points.at(-1)![1]).toBeLessThan(0.1);
    }
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
