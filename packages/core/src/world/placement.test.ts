import { describe, expect, test } from "bun:test";

import { footprintObstacle, validatePlacement } from "./placement";

describe("placement", () => {
  const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };

  test("accepts a footprint that fits inside bounds and clears obstacles", () => {
    const result = validatePlacement({ center: [5, 5], footprint: { w: 2, d: 2 } }, { bounds, obstacles: [] });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.aabb).toEqual({ minX: 4, maxX: 6, minZ: 4, maxZ: 6 });
  });

  test("rejects a footprint that leaves the bounds", () => {
    const result = validatePlacement({ center: [0.5, 5], footprint: { w: 2, d: 2 } }, { bounds });
    expect(result).toEqual({ status: "rejected", reason: "out-of-bounds" });
  });

  test("rejects overlap and reports the obstacle", () => {
    const rack = footprintObstacle({ center: [5, 5], footprint: { w: 2, d: 2 } }, "rack-1");
    const result = validatePlacement({ center: [6, 5], footprint: { w: 2, d: 2 } }, { obstacles: [rack] });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected" && result.reason === "overlap") {
      expect(result.obstacle.id).toBe("rack-1");
      expect(result.index).toBe(0);
    }
  });

  test("snaps the center before validating", () => {
    const result = validatePlacement({ center: [5.4, 5.6], footprint: { w: 2, d: 2 } }, { snap: 1 });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.center).toEqual([5, 6]);
  });

  test("quarter turns rotate the footprint before the fit check", () => {
    const tight = { minX: 0, maxX: 2, minZ: 0, maxZ: 4 };
    const upright = validatePlacement({ center: [1, 2], footprint: { w: 4, d: 2 } }, { bounds: tight });
    expect(upright.status).toBe("rejected");
    const turned = validatePlacement(
      { center: [1, 2], footprint: { w: 4, d: 2 }, quarterTurns: 1 },
      { bounds: tight },
    );
    expect(turned.status).toBe("ok");
  });
});
