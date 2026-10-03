import { expect, test } from "bun:test";
import { slideStep, obstacleFromSolid } from "../movement/solidObstacles";
import type { CollisionObstacle } from "../movement/movementModel";
import { createNavGrid, findPath, findPathResult } from "./navGrid";
import { planSolidRoute, type SolidRouteOptions } from "./solidRoute";
import type { Waypoint } from "./pathFollow";

const from: Waypoint = [0, 0, 0];
const to: Waypoint = [8, 0, 0];
const wall: CollisionObstacle = { position: [4, 1, 0], halfExtents: [0.1, 1, 2] };
const config = (obstacles: CollisionObstacle[] = [wall]): SolidRouteOptions => ({
  bounds: { minX: -2, maxX: 10, minZ: -4, maxZ: 4 }, cellSize: 0.5,
  obstaclesInBounds: () => obstacles,
});

test("thin-wall detours have exact endpoints and body-width segments clear the movement resolver", () => {
  let queries = 0;
  const route = planSolidRoute(from, to, { ...config(), obstaclesInBounds(bounds) {
    queries++;
    expect(bounds.minX).toBe(-2.3);
    expect(bounds.maxZ).toBe(4.3);
    return [wall];
  } });
  expect(queries).toBe(1);
  expect(route.status).toBe("path");
  if (route.status !== "path") throw new Error(route.status);
  expect(route.waypoints[0]).toEqual(from);
  expect(route.waypoints.at(-1)).toEqual(to);
  expect(route.waypoints.some((point) => Math.abs(point[2]) > 2.3)).toBe(true);
  for (let i = 1; i < route.waypoints.length; i++) {
    const a = route.waypoints[i - 1]!;
    const b = route.waypoints[i]!;
    const count = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.02);
    for (let step = 0; step < count; step++) {
      const at: Waypoint = [a[0] + (b[0] - a[0]) * step / count, 0, a[2] + (b[2] - a[2]) * step / count];
      const dx = (b[0] - a[0]) / count;
      const dz = (b[2] - a[2]) / count;
      const actual = slideStep(at, dx, dz, [wall]);
      expect(actual.stepX).toBeCloseTo(dx, 10);
      expect(actual.stepZ).toBeCloseTo(dz, 10);
    }
  }
});

test("blocked endpoints and disconnected local bounds fail without snapping or partial points", () => {
  for (const [a, b] of [[from, [4, 0, 0]], [[4, 0, 0], to]] as [Waypoint, Waypoint][]) {
    const route = planSolidRoute(a, b, config());
    expect(route.status).toBe("no-path");
    expect("waypoints" in route).toBe(false);
  }
  expect(planSolidRoute(from, to, config([{ ...wall, halfExtents: [0.1, 1, 8] }])).status).toBe("no-path");
  expect(planSolidRoute([-3, 0, 0], to, config()).status).toBe("no-path");
});

test("allocation, geometry, search and collision budgets report exhaustion with bounded counters", () => {
  let queries = 0;
  const allocation = planSolidRoute(from, to, { ...config(), maxCells: 1, obstaclesInBounds() { queries++; return []; } });
  expect(allocation.status).toBe("budget");
  expect(queries).toBe(0);
  let gathered = 0;
  const geometry = planSolidRoute(from, to, { ...config(), maxBoxes: 3, obstaclesInBounds: function* () {
    for (;;) { gathered++; yield wall; }
  } });
  expect(geometry.status).toBe("budget");
  expect(geometry.work.boxes).toBe(3);
  expect(gathered).toBe(4);
  const checks = planSolidRoute(from, to, { ...config(), maxChecks: 10 });
  expect(checks.status).toBe("budget");
  expect(checks.work.checks).toBe(10);
  const nodes = planSolidRoute(from, to, { ...config(), maxNodes: 1 });
  expect(nodes.status).toBe("budget");
  expect(nodes.work.visited).toBe(1);
});

test("compound openings, offsets and vertical clearance match movement boxes", () => {
  const arch: CollisionObstacle = { position: [4, 0, 0], boxes: [
    { min: [-0.5, 0, -3], max: [0.5, 4, -1] },
    { min: [-0.5, 0, 1], max: [0.5, 4, 3] },
    { min: [-0.5, 2, -1], max: [0.5, 4, 1] },
  ] };
  expect(planSolidRoute(from, to, config([arch])).status).toBe("path");
  expect(planSolidRoute(from, to, { ...config([arch]), height: 3 }).status).toBe("path");
  const tall = planSolidRoute(from, to, { ...config([arch]), height: 3 });
  if (tall.status !== "path") throw new Error(tall.status);
  expect(tall.waypoints.length).toBeGreaterThan(2);
  const shifted = planSolidRoute(from, to, config([{ ...wall, offset: [0, 0, 4] }]));
  expect(shifted.status).toBe("path");
  if (shifted.status !== "path") throw new Error(shifted.status);
  expect(shifted.waypoints).toEqual([from, to]);
  expect(planSolidRoute([0, 4, 0], [8, 4, 0], config()).status).toBe("path");
});

test("radius gates a narrow opening and rotated solid strips leave nearby space usable", () => {
  const pillars: CollisionObstacle[] = [-1, 1].map((z) => ({ position: [4, 1, z], halfExtents: [0.5, 1, 0.6] }));
  const bounds = { minX: -2, maxX: 10, minZ: -1.5, maxZ: 1.5 };
  expect(planSolidRoute(from, to, { ...config(pillars), bounds, radius: 0.2 }).status).toBe("path");
  expect(planSolidRoute(from, to, { ...config(pillars), bounds, radius: 0.5 }).status).toBe("no-path");
  const rotated = obstacleFromSolid({ center: [4, 1, 0], halfExtents: [3, 1, 0.3], rotationY: Math.PI / 4 });
  const route = planSolidRoute([1, 0, -3], [1, 0, -1], config([rotated]));
  expect(route.status).toBe("path");
  if (route.status !== "path") throw new Error(route.status);
  expect(route.waypoints).toEqual([[1, 0, -3], [1, 0, -1]]);
});

test("terrain edge policy survives smoothing and sampled heights stay caller-owned", () => {
  let calls = 0;
  const route = planSolidRoute(from, to, { ...config([]), sampleHeight: (x) => x / 100,
    canTraverse: (a, b) => { calls++; return Math.hypot(b[0] - a[0], b[2] - a[2]) <= 1; },
  });
  expect(route.status).toBe("path");
  expect(calls).toBeGreaterThan(0);
  if (route.status !== "path") throw new Error(route.status);
  expect(route.waypoints.length).toBeGreaterThan(2);
  for (let i = 1; i < route.waypoints.length; i++) {
    expect(Math.hypot(route.waypoints[i]![0] - route.waypoints[i - 1]![0], route.waypoints[i]![2] - route.waypoints[i - 1]![2])).toBeLessThanOrEqual(1);
  }
  for (const point of route.waypoints.slice(1, -1)) expect(point[1]).toBe(point[0] / 100);
  const slope = planSolidRoute(from, to, { ...config(),
    canTraverse: (a, b) => Math.abs(b[1] - a[1]) / Math.hypot(b[0] - a[0], b[2] - a[2]) <= 0.5,
  });
  expect(slope.status).toBe("path");
});

test("invalid geometry and budgets fail before querying", () => {
  for (const override of [{ cellSize: 0 }, { cellSize: Infinity }, { maxCells: Infinity }, { maxChecks: -1 }, { radius: NaN }]) {
    expect(() => planSolidRoute(from, to, { ...config(), ...override })).toThrow();
  }
  expect(() => planSolidRoute(from, to, config([{ position: [NaN, 0, 0] }]))).toThrow();
  expect(() => planSolidRoute(from, to, config([{ position: [4, 0, 0], halfExtents: [-1, 1, 1] }]))).toThrow();
});

test("priced routes within one cell preserve both exact endpoints, including zero distance", () => {
  const options = { ...config([]), cellSize: 1, stepCost: () => 1 };
  const a: Waypoint = [0.1, 0, 0.1];
  const b: Waypoint = [0.9, 0, 0.9];
  for (const destination of [a, b]) {
    const route = planSolidRoute(a, destination, options);
    expect(route.status).toBe("path");
    if (route.status !== "path") throw new Error(route.status);
    expect(route.waypoints).toEqual([a, destination]);
  }
});

test("legacy grid callers keep null while bounded callers distinguish budget and no-path", () => {
  const grid = createNavGrid({ bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }, cellSize: 1 });
  expect(findPathResult(grid, [0.5, 0.5], [9.5, 9.5], { maxNodes: 1 }).status).toBe("budget");
  expect(findPath(grid, [0.5, 0.5], [9.5, 9.5], { maxNodes: 1 })).toBeNull();
  expect(findPathResult(grid, [0.5, 0.5], [9.5, 9.5], { canTraverse: () => false }).status).toBe("no-path");
  expect(findPathResult(grid, [0.5, 0.5], [1.99, 0.5], { canTraverse: (_a, b) => b[0] <= 1.5 }).status).toBe("no-path");
  const policy = (a: readonly number[], b: readonly number[]) => Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) <= 1;
  const alternate = findPathResult(grid, [0.5, 0.5], [1.99, 0.99], { canTraverse: policy });
  expect(alternate.status).toBe("path");
  if (alternate.status !== "path") throw new Error(alternate.status);
  for (let i = 1; i < alternate.points.length; i++) expect(policy(alternate.points[i - 1]!, alternate.points[i]!)).toBe(true);
});
