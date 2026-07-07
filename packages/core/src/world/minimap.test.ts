import { describe, expect, it } from "bun:test";
import {
  bearingToCardinal,
  clampToMinimapEdge,
  compassBearing,
  headingToBearing,
  projectToMinimap,
  relativeBearing,
  type MinimapView,
} from "./minimap";

const HALF_PI = Math.PI / 2;

describe("compass bearing", () => {
  it("points north for a target toward −Z", () => {
    expect(compassBearing([0, 0], [0, -10])).toBeCloseTo(0);
    expect(bearingToCardinal(compassBearing([0, 0], [0, -10]))).toBe("N");
  });

  it("points east for a target toward +X", () => {
    expect(compassBearing([0, 0], [10, 0])).toBeCloseTo(HALF_PI);
    expect(bearingToCardinal(compassBearing([0, 0], [10, 0]))).toBe("E");
  });

  it("resolves the eight cardinals", () => {
    expect(bearingToCardinal(compassBearing([0, 0], [0, 10]))).toBe("S");
    expect(bearingToCardinal(compassBearing([0, 0], [-10, 0]))).toBe("W");
    expect(bearingToCardinal(compassBearing([0, 0], [10, -10]))).toBe("NE");
    expect(bearingToCardinal(compassBearing([0, 0], [-10, 10]))).toBe("SW");
  });

  it("wraps relative bearings into (−π, π]", () => {
    expect(relativeBearing(0.1, 6.2)).toBeCloseTo(0.1 + Math.PI * 2 - 6.2, 5);
    expect(relativeBearing(HALF_PI, 0)).toBeCloseTo(HALF_PI);
    expect(Math.abs(relativeBearing(0, Math.PI))).toBeCloseTo(Math.PI);
  });

  it("derives facing bearing from yaw", () => {
    expect(bearingToCardinal(headingToBearing(0))).toBe("S");
    expect(bearingToCardinal(headingToBearing(HALF_PI))).toBe("E");
  });
});

describe("minimap projection", () => {
  const view: MinimapView = { center: [0, 0], worldRadius: 50, size: 200 };

  it("places the center point at the middle", () => {
    const point = projectToMinimap([0, 0], view);
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(100);
    expect(point.inside).toBe(true);
  });

  it("maps north (−Z) upward and east (+X) rightward", () => {
    const north = projectToMinimap([0, -50], view);
    expect(north.y).toBeCloseTo(0);
    const east = projectToMinimap([50, 0], view);
    expect(east.x).toBeCloseTo(200);
  });

  it("accepts XYZ points and flags out-of-range markers", () => {
    const far = projectToMinimap([0, 5, 500], view);
    expect(far.inside).toBe(false);
    expect(far.distance).toBeCloseTo(500);
  });

  it("clamps out-of-range points to the edge preserving direction", () => {
    const far = projectToMinimap([500, 0], view);
    const clamped = clampToMinimapEdge(far, view.size);
    expect(clamped.x).toBeCloseTo(200);
    expect(clamped.y).toBeCloseTo(100);
  });

  it("rotates the map so facing points up", () => {
    const rotated = projectToMinimap([50, 0], { ...view, rotate: HALF_PI });
    expect(rotated.y).toBeCloseTo(200);
  });
});
