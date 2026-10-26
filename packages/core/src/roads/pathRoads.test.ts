import { describe, expect, test } from "bun:test";

import { DEFAULT_ROAD_SCAN } from "../world/features";
import { pathRoad } from "./pathRoads";

const points = [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, { x: 40, y: 0, z: 40 }];

describe("pathRoad", () => {
  test("a paved kind is asphalt with the scanned carriageway, no paint or sidewalk unless asked", () => {
    const street = pathRoad({ id: "s", kind: "road", points, width: 9 })!;
    expect(street.width).toBe(9);
    expect(street.surface).toBeUndefined();
    expect(street.materials?.road).toBe(DEFAULT_ROAD_SCAN);
    expect(street.markings).toBe(false);
    expect(street.sidewalk).toBe(false);
  });

  test("a race track reads width, paint, sidewalks and the closed loop from meta", () => {
    const track = pathRoad({ id: "t", kind: "track", points, meta: { width: 14, markings: true, sidewalk: 3, closed: true } })!;
    expect(track.width).toBe(14);
    expect(track.markings).toBe(true);
    expect(track.sidewalk).toEqual({ width: 3, color: "#a7adb8" });
    expect(track.closed).toBe(true);
  });

  test("a trail is unpaved ground named by its surface or kind, with no scan", () => {
    const trail = pathRoad({ id: "d", kind: "trail", points, meta: { surface: "gravel", wear: 0.4 } })!;
    expect(trail.surface).toBe("gravel");
    expect(trail.materials).toBeUndefined();
    expect(trail.wear).toBe(0.4);
    expect(pathRoad({ id: "r", kind: "route", points })!.surface).toBe("route");
    expect(pathRoad({ id: "f", kind: "trail", points }, { surfaceDetail: false })!.surface).toBe(false);
  });

  test("a path with under two points draws nothing", () => {
    expect(pathRoad({ id: "x", kind: "road", points: [points[0]!] })).toBeNull();
  });
});
