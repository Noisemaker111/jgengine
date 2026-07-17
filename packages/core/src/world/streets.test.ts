import { describe, expect, test } from "bun:test";
import { road } from "./features";
import { isOnRoad } from "./roads";
import {
  distanceToRoadEdge,
  furnitureSpots,
  laneCenters,
  offsetPath,
  parkingSpots,
  roadSurfaceSampler,
  sidewalkPaths,
  sidewalkPoint,
  sidewalkWidthOf,
} from "./streets";

const avenue = road({ path: [[0, 0], [0, 200]], width: 10 });

describe("world/streets", () => {
  test("offsetPath shifts perpendicular to travel", () => {
    const shifted = offsetPath([[0, 0], [0, 100]], 3);
    expect(shifted[0]![0]).toBeCloseTo(-3);
    expect(shifted[1]![1]).toBeCloseTo(100);
  });

  test("laneCenters are directed right-hand lanes off the centerline", () => {
    const [forward, reverse] = laneCenters(avenue);
    expect(forward.direction).toBe("forward");
    expect(forward.path[0]![0]).toBeCloseTo(2.5);
    expect(reverse.path[0]![1]).toBeCloseTo(200);
    expect(reverse.path[0]![0]).toBeCloseTo(-2.5);
  });

  test("sidewalks resolve by default and pave both edges", () => {
    expect(sidewalkWidthOf(avenue)).toBeCloseTo(2.6);
    const paths = sidewalkPaths(avenue);
    expect(paths.length).toBe(2);
    expect(Math.abs(paths[0]![0]![0])).toBeCloseTo(5 + 1.3);
    const bare = road({ path: [[0, 0], [0, 10]], sidewalk: false });
    expect(sidewalkPaths(bare).length).toBe(0);
  });

  test("furniture spots sit off the asphalt, face outward, and stagger sides", () => {
    const spots = furnitureSpots(avenue, { spacing: 40 });
    expect(spots.length).toBe(5);
    for (const spot of spots) {
      expect(isOnRoad(avenue.path, avenue.width, spot.position[0], spot.position[1])).toBe(false);
    }
    expect(spots[0]!.side).not.toBe(spots[1]!.side);
  });

  test("parking spots hug the curb headed with traffic", () => {
    const spots = parkingSpots(avenue, { spacing: 50, sides: "right" });
    expect(spots.length).toBeGreaterThan(1);
    for (const spot of spots) {
      expect(spot.position[0]).toBeCloseTo(5 - 1.2);
      expect(Math.abs(Math.sin(spot.heading))).toBeCloseTo(0, 5);
    }
  });

  test("sidewalkPoint samples along a band deterministically", () => {
    const midLeft = sidewalkPoint(avenue, "left", 0.5);
    expect(midLeft?.[1]).toBeCloseTo(100);
    expect(Math.abs(midLeft?.[0] ?? 0)).toBeCloseTo(6.3);
  });
});

describe("world/streets — distanceToRoadEdge", () => {
  test.each([
    ["centerline reads negative half-width", 0, 100, -5],
    ["curb reads ~zero", 5, 100, 0],
    ["ten units past the curb reads +10", 15, 100, 10],
  ])("%s", (_label, x, z, expected) => {
    expect(distanceToRoadEdge([avenue], x, z)).toBeCloseTo(expected);
  });

  test("nearest of two roads wins", () => {
    const parallel = road({ path: [[50, 0], [50, 200]], width: 10 });
    // (48,100) sits 2 in from road B's centerline (3 inside its curb), 43 from road A's.
    expect(distanceToRoadEdge([avenue, parallel], 48, 100)).toBeCloseTo(-3);
  });

  test("multi-segment path resolves against the nearest corner segment", () => {
    const elbow = road({ path: [[0, 0], [0, 100], [100, 100]], width: 8 });
    // Nearest the horizontal leg (z=100): 5 out from centerline → 1 past the 4-half-width curb.
    expect(distanceToRoadEdge([elbow], 60, 105)).toBeCloseTo(1);
    // Beyond the outside of the corner: clamps to the shared vertex (0,100), hypot(5,5)-4.
    expect(distanceToRoadEdge([elbow], -5, 105)).toBeCloseTo(Math.hypot(5, 5) - 4);
  });

  test("no road surface is infinitely off-road", () => {
    expect(distanceToRoadEdge([], 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("world/streets — roadSurfaceSampler", () => {
  test("full grip on the asphalt, off-road grip past the shoulder", () => {
    const grip = roadSurfaceSampler([avenue]);
    expect(grip(0, 100)).toBeCloseTo(1); // centerline
    expect(grip(20, 100)).toBeCloseTo(0.72); // well off the road
  });

  test("grip ramps monotonically down across the shoulder band", () => {
    const grip = roadSurfaceSampler([avenue], { onRoad: 1, offRoad: 0.72, shoulder: 3 });
    const curb = grip(5, 100); // edge 0
    const mid = grip(6.5, 100); // edge 1.5
    const beyond = grip(8, 100); // edge 3 (band end)
    expect(curb).toBeCloseTo(1);
    expect(mid).toBeCloseTo(0.86);
    expect(beyond).toBeCloseTo(0.72);
    expect(curb).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(beyond);
  });

  test("custom grip levels are honoured", () => {
    const grip = roadSurfaceSampler([avenue], { onRoad: 1.2, offRoad: 0.5, shoulder: 4 });
    expect(grip(0, 100)).toBeCloseTo(1.2);
    expect(grip(7, 100)).toBeCloseTo(1.2 + (0.5 - 1.2) * 0.5); // edge 2 of 4
    expect(grip(100, 100)).toBeCloseTo(0.5);
  });
});
