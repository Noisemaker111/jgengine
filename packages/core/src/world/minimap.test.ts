import { describe, expect, it } from "bun:test";
import {
  bearingToCardinal,
  clampToMinimapEdge,
  compassBearing,
  headingToBearing,
  projectToMinimap,
  relativeBearing,
  unprojectFromMinimap,
  type MinimapView,
  type WorldXZ,
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

  it("rotates the map so the facing bearing points up", () => {
    const facingEast = { ...view, rotate: HALF_PI };
    const east = projectToMinimap([50, 0], facingEast);
    expect(east.x).toBeCloseTo(100);
    expect(east.y).toBeCloseTo(0);
    const north = projectToMinimap([0, -50], facingEast);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(100);
  });

  it("keeps a rotating map aligned with headingToBearing of the entity yaw", () => {
    const yaw = Math.PI / 3;
    const aheadOfEntity: [number, number] = [Math.sin(yaw) * 25, Math.cos(yaw) * 25];
    const projected = projectToMinimap(aheadOfEntity, { ...view, rotate: headingToBearing(yaw) });
    expect(projected.x).toBeCloseTo(100);
    expect(projected.y).toBeCloseTo(50);
  });
});

describe("unprojectFromMinimap", () => {
  const view: MinimapView = { center: [10, -20], worldRadius: 50, size: 200 };
  const points: readonly WorldXZ[] = [
    [10, -20],
    [35, -5],
    [-15, -60],
    [40, 40],
    [-33.5, 12.25],
    [10.001, -19.999],
  ];

  function expectRoundTrip(withRotate: MinimapView): void {
    for (const point of points) {
      const projected = projectToMinimap(point, withRotate);
      const [x, z] = unprojectFromMinimap({ x: projected.x, y: projected.y }, withRotate);
      expect(x).toBeCloseTo(point[0], 6);
      expect(z).toBeCloseTo(point[1], 6);
    }
  }

  it("round-trips projectToMinimap with rotate unset (north-up)", () => {
    expectRoundTrip(view);
  });

  it("round-trips projectToMinimap with rotate = 0.7", () => {
    expectRoundTrip({ ...view, rotate: 0.7 });
  });

  it("round-trips projectToMinimap with rotate = -2.1", () => {
    expectRoundTrip({ ...view, rotate: -2.1 });
  });

  it("returns the center for a degenerate zero worldRadius", () => {
    const degenerate = { ...view, worldRadius: 0 };
    const [x, z] = unprojectFromMinimap({ x: 137, y: 42 }, degenerate);
    expect(x).toBeCloseTo(view.center[0]);
    expect(z).toBeCloseTo(view.center[1]);
  });
});
