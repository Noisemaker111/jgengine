import { describe, expect, test } from "bun:test";
import { environment, road } from "./features";
import { summarizeEnvironment } from "./environmentSummary";
import {
  buildJunctionPatch,
  buildRoadRibbon,
  dashSegments,
  isOnRoad,
  nearestOnPath,
  pathLength,
  roundPathCorners,
} from "./roads";

const flat = () => 0;

describe("world/roads", () => {
  test("road() resolves defaults and validates the path", () => {
    const descriptor = road({ path: [[0, 0], [100, 0]] });
    expect(descriptor.kind).toBe("road");
    expect(descriptor.width).toBe(8);
    expect(descriptor.markings).toBe(true);
    expect(() => road({ path: [[0, 0]] })).toThrow();
  });

  test("buildRoadRibbon drapes a subdivided two-sided strip", () => {
    const ribbon = buildRoadRibbon([[0, 0], [40, 0]], 8, (x) => x * 0.1, { maxSegmentLength: 10 });
    expect(ribbon.positions.length).toBe(5 * 6);
    expect(ribbon.indices.length).toBe(4 * 6);
    expect(ribbon.positions[1]).toBeCloseTo(0.08, 3);
    const lastY = ribbon.positions[ribbon.positions.length - 2]!;
    expect(lastY).toBeCloseTo(4.08, 3);
    expect(ribbon.positions[2]).toBeCloseTo(4, 3);
    expect(ribbon.positions[5]).toBeCloseTo(-4, 3);
  });

  test("dashSegments alternates paint and gap along arc length", () => {
    const dashes = dashSegments([[0, 0], [30, 0]], 3, 3);
    expect(dashes.length).toBe(5);
    const first = dashes[0]!;
    expect(first[0]![0]).toBeCloseTo(0);
    expect(first[first.length - 1]![0]).toBeCloseTo(3);
  });

  test("dashSegments drops dashes whose midpoint falls inside a junction exclusion", () => {
    const full = dashSegments([[0, 0], [60, 0]], 3, 3);
    const clipped = dashSegments([[0, 0], [60, 0]], 3, 3, [{ center: [30, 0], radius: 8 }]);
    expect(clipped.length).toBeLessThan(full.length);
    // No surviving dash has its midpoint within the excluded circle.
    for (const dash of clipped) {
      const a = dash[0]!;
      const b = dash[dash.length - 1]!;
      const mid: readonly [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(Math.hypot(mid[0] - 30, mid[1] - 0)).toBeGreaterThan(8);
    }
  });

  test("center-line dash ribbon stays centered on the path regardless of width", () => {
    for (const width of [0.3, 1, 4]) {
      const ribbon = buildRoadRibbon([[0, 0], [20, 0]], width, () => 0, { maxSegmentLength: 20 });
      // Two draped vertices per centerline point (left then right); their XZ midpoint is the centerline.
      const midX = (ribbon.positions[0]! + ribbon.positions[3]!) / 2;
      const midZ = (ribbon.positions[2]! + ribbon.positions[5]!) / 2;
      expect(midX).toBeCloseTo(0, 6);
      expect(midZ).toBeCloseTo(0, 6);
      // Left/right offsets are symmetric (equal magnitude, opposite sign).
      expect(ribbon.positions[2]! + ribbon.positions[5]!).toBeCloseTo(0, 6);
    }
  });

  test("buildJunctionPatch drapes a bounded disc fan centered on the crossing", () => {
    const patch = buildJunctionPatch([10, 20], 5, (x, z) => x * 0.1 + z * 0.05, {
      elevation: 0.2,
      segments: 12,
    });
    // Center vertex + one ring vertex per segment.
    expect(patch.positions.length).toBe((12 + 1) * 3);
    expect(patch.indices.length).toBe(12 * 3);
    // Center vertex sits at the junction center, draped + elevation.
    expect(patch.positions[0]).toBeCloseTo(10, 6);
    expect(patch.positions[2]).toBeCloseTo(20, 6);
    expect(patch.positions[1]).toBeCloseTo(10 * 0.1 + 20 * 0.05 + 0.2, 6);
    // Every ring vertex lies within `radius` of the center in XZ.
    for (let i = 1; i <= 12; i += 1) {
      const dx = patch.positions[i * 3]! - 10;
      const dz = patch.positions[i * 3 + 2]! - 20;
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(5 + 1e-6);
    }
    // Degenerate radius yields no geometry.
    expect(buildJunctionPatch([0, 0], 0, () => 0).positions.length).toBe(0);
  });

  test("nearestOnPath and isOnRoad answer proximity queries", () => {
    const path = [[0, 0], [100, 0]] as const;
    const sample = nearestOnPath(path, 50, 3);
    expect(sample?.distance).toBeCloseTo(3);
    expect(sample?.point[0]).toBeCloseTo(50);
    expect(sample?.tangent[0]).toBeCloseTo(1);
    expect(isOnRoad(path, 8, 50, 3)).toBe(true);
    expect(isOnRoad(path, 8, 50, 5)).toBe(false);
    expect(pathLength(path)).toBe(100);
  });

  test("environment() carries roads and summarizeEnvironment counts them", () => {
    const world = environment({
      roads: [road({ path: [[0, 0], [60, 0], [60, 60]] }), road({ path: [[0, 0], [0, 80]], width: 6 })],
    });
    expect(world.roads?.length).toBe(2);
    const summary = summarizeEnvironment(world);
    expect(summary.counts.roads).toBe(2);
    expect(summary.roads[0]?.length).toBe(120);
    expect(summary.roads[1]?.width).toBe(6);
    expect(summary.isEmpty).toBe(false);
  });
});

describe("roundPathCorners", () => {
  test("fillets a right-angle corner into an arc that no longer passes through the sharp vertex", () => {
    const rounded = roundPathCorners([[0, 0], [10, 0], [10, 10]], 3, 5);
    // Endpoints preserved.
    expect(rounded[0]).toEqual([0, 0]);
    expect(rounded[rounded.length - 1]).toEqual([10, 10]);
    // The sharp corner (10,0) is replaced by arc points — none sit exactly on it.
    expect(rounded.some((p) => p[0] === 10 && p[1] === 0)).toBe(false);
    // Arc stays inside the corner (x < 10 near the bend).
    expect(rounded.every((p) => p[0] <= 10 + 1e-9)).toBe(true);
    expect(rounded.length).toBeGreaterThan(3);
  });

  test("radius clamps to half the shorter adjacent segment and short paths pass through", () => {
    expect(roundPathCorners([[0, 0], [1, 0]], 5)).toEqual([[0, 0], [1, 0]]);
    // A tiny middle segment clamps the fillet so arcs never cross past the neighbours.
    const rounded = roundPathCorners([[0, 0], [4, 0], [4, 1], [8, 1]], 10, 4);
    expect(rounded.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))).toBe(true);
  });
});
