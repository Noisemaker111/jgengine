import { describe, expect, test } from "bun:test";

import {
  createPlacementController,
  quarterTurnsToRotationY,
  type PlacementHit,
} from "./placementController";

function hit(x: number, y: number, z: number): PlacementHit {
  return { point: [x, y, z], normal: [0, 1, 0] };
}

describe("placementController", () => {
  const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  test("grid snap-mode snaps the ghost center to the grid", () => {
    const controller = createPlacementController({ footprint: { w: 2, d: 2 }, grid: 1, snapMode: "grid" });
    const preview = controller.hover(hit(3.4, 0, 5.6));
    expect(preview.center).toEqual([3, 6]);
    expect(preview.valid).toBe(true);
  });

  test("free snap-mode keeps the raw cursor position", () => {
    const controller = createPlacementController({ footprint: { w: 2, d: 2 }, snapMode: "free" });
    const preview = controller.hover(hit(3.4, 0, 5.6));
    expect(preview.center).toEqual([3.4, 5.6]);
  });

  test("surface snap-mode carries the hit height as ghost y", () => {
    const controller = createPlacementController({ footprint: { w: 2, d: 2 }, snapMode: "surface" });
    const preview = controller.hover(hit(2, 4.5, 2));
    expect(preview.y).toBe(4.5);
    expect(preview.center).toEqual([2, 2]);
  });

  test("tints invalid when the footprint overlaps an obstacle", () => {
    const controller = createPlacementController({
      footprint: { w: 2, d: 2 },
      snapMode: "free",
      rules: { obstacles: [{ aabb: { minX: 4, maxX: 6, minZ: 4, maxZ: 6 } }] },
    });
    const preview = controller.hover(hit(5, 0, 5));
    expect(preview.valid).toBe(false);
    expect(preview.reason).toBe("overlap");
  });

  test("tints invalid out of bounds", () => {
    const controller = createPlacementController({ footprint: { w: 2, d: 2 }, snapMode: "free", rules: { bounds } });
    const preview = controller.hover(hit(9.5, 0, 0));
    expect(preview.valid).toBe(false);
    expect(preview.reason).toBe("out-of-bounds");
  });

  test("rotate re-evaluates the ghost with the new orientation", () => {
    const tight = { minX: -1, maxX: 1, minZ: -2, maxZ: 2 };
    const controller = createPlacementController({
      footprint: { w: 4, d: 2 },
      snapMode: "free",
      rules: { bounds: tight },
    });
    expect(controller.hover(hit(0, 0, 0)).valid).toBe(false);
    const turned = controller.rotate();
    expect(turned?.valid).toBe(true);
    expect(turned?.quarterTurns).toBe(1);
  });

  test("commit returns the placement only when valid", () => {
    const controller = createPlacementController({ footprint: { w: 2, d: 2 }, snapMode: "free", rules: { bounds } });
    controller.hover(hit(9.9, 0, 0));
    expect(controller.commit()).toBeNull();
    controller.hover(hit(0, 1.5, 0));
    const commit = controller.commit();
    expect(commit).not.toBeNull();
    expect(commit?.center).toEqual([0, 0]);
    expect(commit?.y).toBe(1.5);
  });

  test("cycleSnapMode walks grid -> free -> surface", () => {
    const controller = createPlacementController({ footprint: { w: 1, d: 1 }, snapMode: "grid" });
    expect(controller.cycleSnapMode()).toBe("free");
    expect(controller.cycleSnapMode()).toBe("surface");
    expect(controller.cycleSnapMode()).toBe("grid");
  });

  test("quarterTurnsToRotationY maps quarter turns onto radians", () => {
    expect(quarterTurnsToRotationY(0)).toBe(0);
    expect(quarterTurnsToRotationY(1)).toBeCloseTo(-Math.PI / 2);
    expect(quarterTurnsToRotationY(4)).toBe(0);
  });
});
