import { describe, expect, test } from "bun:test";
import { placementGround, pathSegmentDistance, selectionGizmoMode, snapPlacement } from "./authoringPlacement";

import { createEditableTerrain } from "@jgengine/core/world/terraform";
import { flatField } from "@jgengine/core/world/terrain";
import { withPathProfiles } from "@jgengine/core/world/pathTerrain";

describe("viewport authoring", () => {
  test("grid samples marker, zone and path heights while other modes preserve hits", () => {
    expect(snapPlacement({ x: 3.8, y: 7.25, z: -5.8 }, "grid", 2, () => 7.25)).toEqual({ x: 4, y: 7.25, z: -6 });
    const point = { x: 3.8, y: 7.25, z: -5.8 };
    expect(snapPlacement(point, "ground", 2, () => 0)).toBe(point);
    expect(snapPlacement(point, "grid", 0, () => 0)).toBe(point);
  });
  test("grid resamples the shared ground at snapped XZ on either side of a slope", () => {
    const calls: number[][] = [];
    const ground = (x: number, z: number) => { calls.push([x, z]); return x + z * 2; };
    expect(snapPlacement({ x: 0.9, y: 0.9, z: 0 }, "grid", 2, ground)).toEqual({ x: 0, y: 0, z: 0 });
    expect(snapPlacement({ x: 1.1, y: 1.1, z: 0 }, "grid", 2, ground)).toEqual({ x: 2, y: 2, z: 0 });
    expect(snapPlacement({ x: -1.1, y: -3.3, z: -1.1 }, "grid", 2, ground)).toEqual({ x: -2, y: -6, z: -2 });
    expect(calls).toEqual([[0, 0], [2, 0], [-2, -2]]);
  });
  test("off-surface follows the ground sampler policy; invalid height rejects placement", () => {
    expect(snapPlacement({ x: 1.1, y: 9, z: 0 }, "grid", 2, () => 0)).toEqual({ x: 2, y: 0, z: 0 });
    expect(snapPlacement({ x: 1.1, y: 9, z: 0 }, "grid", 2, () => NaN)).toBeNull();
    expect(snapPlacement({ x: 1.1, y: 9, z: 0 }, "grid", 2, () => Infinity)).toBeNull();
  });
  test("placement composes sculpt offsets with graded paths and follows off-map base ground", () => {
    const base = { ...flatField(), sampleHeight: withPathProfiles(() => 5, [{ points: [[-4, 0], [4, 0]], width: 2, height: { kind: "grade", start: 1, end: 9 } }]) };
    const sculpt = createEditableTerrain({ bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 }, cellSize: 1 });
    sculpt.apply({ mode: "raise", center: [2, 0], radius: 1, strength: 3 });
    const ground = placementGround(sculpt.snapshot(), base)!;
    expect(snapPlacement({ x: 1.1, y: ground.sampleHeight(1.1, 0), z: 0 }, "grid", 2, ground.sampleHeight)).toEqual({ x: 2, y: 10, z: 0 });
    expect(snapPlacement({ x: 4.1, y: 15, z: 4.1 }, "grid", 4, ground.sampleHeight)).toEqual({ x: 4, y: 5, z: 4 });
    expect(placementGround(undefined, base)).toBe(base);
    expect(placementGround(undefined, null)).toBeNull();
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
