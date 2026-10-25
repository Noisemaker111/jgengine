import { describe, expect, test } from "bun:test";

import { editorLayers } from "../../editorLayers";
import { TOWER_CATALOG, TOWER_IDS, towerDef } from "../entities/towers/catalog";
import { BUILD_PLOT_XZ, FLANK_WAYPOINTS_XZ, PATH_WAYPOINTS_XZ, type Vec2 } from "./layout";

/** Creeps walk the centerline; a tower needs at least this much slack past it so one waypoint corner does not drop the target. */
const RANGE_MARGIN = 1;
/** Shortest slice of path a tower must see from a plot so a walking creep stays in range for several shots. */
const MIN_ENGAGEMENT_LENGTH = 6;
/** Radius of the stone foundation drawn under every plot (WorldOverlay). */
const PLOT_FOUNDATION_RADIUS = 1.5;

function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dz * t));
}

/** Nearest road centerline: the main approach or the east flank, whichever a plot was set to cover. */
function distanceToPath(point: Vec2): number {
  let best = Number.POSITIVE_INFINITY;
  for (const road of [PATH_WAYPOINTS_XZ, FLANK_WAYPOINTS_XZ]) {
    for (let i = 1; i < road.length; i += 1) {
      best = Math.min(best, distanceToSegment(point, road[i - 1]!, road[i]!));
    }
  }
  return best;
}

function plotClearance(id: string): number {
  const marker = editorLayers.markers.find((candidate) => candidate.id === id);
  const clearance = marker?.meta?.clearance;
  return typeof clearance === "number" ? clearance : 0;
}

describe("build plots vs tower ranges", () => {
  test("every tower can fire on the path centerline from every plot", () => {
    for (const plot of BUILD_PLOT_XZ) {
      const toPath = distanceToPath(plot.xz);
      for (const id of TOWER_IDS) {
        const range = towerDef(id, editorLayers).range;
        expect(range, `${id} on ${plot.id} (path ${toPath.toFixed(1)} away)`).toBeGreaterThanOrEqual(toPath + RANGE_MARGIN);
        const chord = 2 * Math.sqrt(Math.max(0, range * range - toPath * toPath));
        expect(chord, `${id} on ${plot.id} sees ${chord.toFixed(1)} of path`).toBeGreaterThanOrEqual(MIN_ENGAGEMENT_LENGTH);
      }
    }
  });

  test("the scene catalog seeds the same ranges the code declares", () => {
    for (const id of TOWER_IDS) {
      expect(towerDef(id, editorLayers).range).toBe(TOWER_CATALOG[id]!.range);
    }
  });
});

describe("build plot layout", () => {
  test("no two plots overlap their clearance discs", () => {
    for (let i = 0; i < BUILD_PLOT_XZ.length; i += 1) {
      for (let j = i + 1; j < BUILD_PLOT_XZ.length; j += 1) {
        const a = BUILD_PLOT_XZ[i]!;
        const b = BUILD_PLOT_XZ[j]!;
        const gap = Math.hypot(a.xz[0] - b.xz[0], a.xz[1] - b.xz[1]);
        expect(gap, `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(plotClearance(a.id) + plotClearance(b.id));
      }
    }
  });

  test("plot foundations sit beside the path, never on it", () => {
    const pathWidth = editorLayers.paths.find((path) => path.id === "creep-path")?.width ?? 4;
    for (const plot of BUILD_PLOT_XZ) {
      expect(distanceToPath(plot.xz), plot.id).toBeGreaterThanOrEqual(pathWidth / 2 + PLOT_FOUNDATION_RADIUS);
    }
  });
});
