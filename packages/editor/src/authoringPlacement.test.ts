import { describe, expect, test } from "bun:test";
import { pathSegmentDistance, selectionGizmoMode, snapPlacement } from "./authoringPlacement";

describe("viewport authoring", () => {
  test("grid snaps marker, zone and path hits while retaining terrain elevation", () => {
    expect(snapPlacement({ x: 3.8, y: 7.25, z: -5.8 }, "grid", 2)).toEqual({ x: 4, y: 7.25, z: -6 });
    const point = { x: 3.8, y: 7.25, z: -5.8 };
    expect(snapPlacement(point, "ground", 2)).toBe(point);
    expect(snapPlacement(point, "grid", 0)).toBe(point);
  });
  test("long paths select at the midpoint and do not extend beyond their ends", () => {
    expect(pathSegmentDistance({ x: 50, y: 12 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(12);
    expect(pathSegmentDistance({ x: 120, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(20);
    expect(pathSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
  test("multi-selection always translates marker and zone groups together", () => {
    expect(selectionGizmoMode("rotate", "marker", 2)).toBe("translate");
    expect(selectionGizmoMode("scale", "volume", 2)).toBe("translate");
    expect(selectionGizmoMode("rotate", "marker", 1)).toBe("rotate");
    expect(selectionGizmoMode("scale", "volume", 1)).toBe("scale");
  });
});
