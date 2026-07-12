import { describe, expect, test } from "bun:test";
import { road } from "./features";
import { isOnRoad } from "./roads";
import {
  furnitureSpots,
  laneCenters,
  offsetPath,
  parkingSpots,
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
