import { describe, expect, test } from "bun:test";
import { environment, road } from "./features";
import { summarizeEnvironment } from "./environmentSummary";
import { buildRoadRibbon, dashSegments, isOnRoad, nearestOnPath, pathLength } from "./roads";

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
