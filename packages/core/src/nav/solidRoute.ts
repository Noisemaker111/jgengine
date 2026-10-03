import type { CollisionObstacle } from "../movement/movementModel";
import type { Aabb } from "../world/geometry";
import { createNavGrid, findPathResult, type NavPoint } from "./navGrid";
import type { Waypoint } from "./pathFollow";

/** Caller-owned local collision query and terrain policy; no movement or perception state. */
export interface SolidRouteOptions {
  bounds: Aabb;
  cellSize: number;
  /** Query the indexed movement geometry, including mover clearance outside these bounds. */
  obstaclesInBounds: (bounds: Aabb) => Iterable<CollisionObstacle>;
  radius?: number;
  height?: number;
  /** Intermediate waypoint elevation. Defaults to the start's feet height. */
  sampleHeight?: (x: number, z: number) => number;
  /** Terrain/door policy for every edge and smoothing shortcut. */
  canTraverse?: (from: Waypoint, to: Waypoint) => boolean;
  /** Cost multiplier >=1. Suppresses smoothing by default to retain the priced route. */
  stepCost?: (from: NavPoint, to: NavPoint) => number;
  smooth?: boolean;
  /** Grid allocation cap. Default 4096. */
  maxCells?: number;
  /** Gathered obstacle/sub-box cap. Default 256. */
  maxBoxes?: number;
  /** Search expansion cap. Default 1024. */
  maxNodes?: number;
  /** Collision-box tests and terrain-policy calls combined. Default 100000. */
  maxChecks?: number;
}

/** Work counters exclude the caller's spatial-query implementation. */
export interface SolidRouteWork { cells: number; boxes: number; visited: number; checks: number }

/** Failures never carry a partial or snapped route. */
export type SolidRouteResult =
  | { status: "path"; waypoints: Waypoint[]; work: SolidRouteWork }
  | { status: "no-path" | "budget"; work: SolidRouteWork };

interface Box { min: Waypoint; max: Waypoint }

function intersects(from: Waypoint, to: Waypoint, box: Box, radius: number, height: number): boolean {
  if (box.max[1] <= Math.min(from[1], to[1]) || box.min[1] >= Math.max(from[1], to[1]) + height) return false;
  let enter = 0;
  let exit = 1;
  for (const axis of [0, 2] as const) {
    const min = box.min[axis] - radius;
    const max = box.max[axis] + radius;
    const delta = to[axis] - from[axis];
    if (delta === 0) {
      if (from[axis] <= min || from[axis] >= max) return false;
    } else {
      const a = (min - from[axis]) / delta;
      const b = (max - from[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
      if (enter >= exit) return false;
    }
  }
  return enter < exit;
}

/**
 * Plan an exact-endpoint local route over indexed movement boxes using the shared nav grid.
 * Every edge is swept at body width; bounded failure leaves retry/stop policy with the caller.
 * @capability solid-route bounded local planning over indexed collision geometry
 */
export function planSolidRoute(from: Waypoint, to: Waypoint, options: SolidRouteOptions): SolidRouteResult {
  const { bounds, cellSize } = options;
  const radius = options.radius ?? 0.3;
  const height = options.height ?? 1.8;
  const maxCells = options.maxCells ?? 4096;
  const maxBoxes = options.maxBoxes ?? 256;
  const maxNodes = options.maxNodes ?? 1024;
  const maxChecks = options.maxChecks ?? 100000;
  if (![...from, ...to, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, cellSize, radius, height].every(Number.isFinite) ||
    cellSize <= 0 || radius < 0 || height <= 0 || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ ||
    ![maxCells, maxBoxes, maxNodes, maxChecks].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("solidRoute requires finite geometry and nonnegative integer budgets.");
  }
  const work: SolidRouteWork = { cells: 0, boxes: 0, visited: 0, checks: 0 };
  const failure = (status: "no-path" | "budget"): SolidRouteResult => ({ status, work });
  const inside = (point: Waypoint) => point[0] >= bounds.minX && point[0] < bounds.maxX && point[2] >= bounds.minZ && point[2] < bounds.maxZ;
  if (!inside(from) || !inside(to)) return failure("no-path");
  const cells = Math.ceil((bounds.maxX - bounds.minX) / cellSize) * Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
  if (cells > maxCells) return failure("budget");
  const boxes: Box[] = [];
  const query = { minX: bounds.minX - radius, maxX: bounds.maxX + radius, minZ: bounds.minZ - radius, maxZ: bounds.maxZ + radius };
  for (const obstacle of options.obstaclesInBounds(query)) {
    const half = obstacle.halfExtents ?? [0.5, 0.5, 0.5];
    const offset = obstacle.offset ?? [0, 0, 0];
    const local = obstacle.boxes?.length ? obstacle.boxes : [{
      min: [offset[0] - half[0], offset[1] - half[1], offset[2] - half[2]],
      max: [offset[0] + half[0], offset[1] + half[1], offset[2] + half[2]],
    }];
    for (const box of local) {
      if (boxes.length >= maxBoxes) return failure("budget");
      const worldBox: Box = {
        min: [obstacle.position[0] + box.min[0]!, obstacle.position[1] + box.min[1]!, obstacle.position[2] + box.min[2]!],
        max: [obstacle.position[0] + box.max[0]!, obstacle.position[1] + box.max[1]!, obstacle.position[2] + box.max[2]!],
      };
      if (![...worldBox.min, ...worldBox.max].every(Number.isFinite) || worldBox.min.some((value, axis) => value > worldBox.max[axis]!)) {
        throw new Error("solidRoute obstacle boxes must be finite and ordered.");
      }
      boxes.push(worldBox);
      work.boxes++;
    }
  }
  let exhausted = false;
  const spend = () => {
    if (work.checks >= maxChecks) { exhausted = true; return false; }
    work.checks++;
    return true;
  };
  const clear = (a: Waypoint, b: Waypoint): boolean => {
    if (exhausted) return false;
    for (const box of boxes) {
      if (!spend() || intersects(a, b, box, radius, height)) return false;
    }
    return options.canTraverse === undefined || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) ||
      (spend() && options.canTraverse(a, b));
  };
  if (!clear(from, from) || !clear(to, to)) return failure(exhausted ? "budget" : "no-path");
  const directClear = clear(from, to);
  if (options.stepCost === undefined && directClear) return { status: "path", waypoints: [[...from], [...to]], work };
  if (exhausted) return failure("budget");
  const grid = createNavGrid({ bounds, cellSize });
  const start = grid.cellAt([from[0], from[2]]);
  const goal = grid.cellAt([to[0], to[2]]);
  if (start.col === goal.col && start.row === goal.row) {
    return directClear ? { status: "path", waypoints: [[...from], [...to]], work } : failure("no-path");
  }
  const center = grid.center;
  grid.center = (col, row) => col === start.col && row === start.row ? [from[0], from[2]] :
    col === goal.col && row === goal.row ? [to[0], to[2]] : center(col, row);
  const waypoint = (point: NavPoint): Waypoint => {
    if (point[0] === from[0] && point[1] === from[2]) return from;
    if (point[0] === to[0] && point[1] === to[2]) return to;
    const y = options.sampleHeight?.(point[0], point[1]) ?? from[1];
    if (!Number.isFinite(y)) throw new Error("solidRoute sampleHeight must be finite.");
    return [point[0], y, point[1]];
  };
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const point = waypoint(grid.center(col, row));
      grid.setWalkable(col, row, inside(point) && clear(point, point));
      work.cells++;
      if (exhausted) return failure("budget");
    }
  }
  const result = findPathResult(grid, [from[0], from[2]], [to[0], to[2]], {
    maxNodes, stepCost: options.stepCost, smooth: options.smooth ?? options.stepCost === undefined,
    canTraverse: (a, b) => clear(waypoint(a), waypoint(b)),
  });
  work.visited = result.visited;
  if (exhausted) return failure("budget");
  if (result.status !== "path") return failure(result.status);
  const waypoints = result.points.map((point): Waypoint => [...waypoint(point)]);
  for (let i = 1; i < waypoints.length; i++) {
    if (!clear(waypoints[i - 1]!, waypoints[i]!)) return failure(exhausted ? "budget" : "no-path");
  }
  return { status: "path", waypoints, work };
}
