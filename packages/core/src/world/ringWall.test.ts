import { describe, expect, test } from "bun:test";

import { ringWall } from "./ringWall";

describe("ring wall", () => {
  test("a closed ring of slabs just outside the floor, each standing on the lowest ground under it", () => {
    const solids = ringWall({ center: [100, -50], radius: 40, height: 20, thickness: 4, sides: 16, ground: (x) => (x > 100 ? 5 : 0) });
    expect(solids).toHaveLength(16);
    for (const solid of solids) {
      const distance = Math.hypot(solid.center[0] - 100, solid.center[2] + 50);
      expect(distance).toBeCloseTo(42, 5);
      // The slab runs along the ring: local +x (cos, -sin of rotationY) is perpendicular to the radius.
      const yaw = solid.rotationY ?? 0;
      const radial = [(solid.center[0] - 100) / distance, (solid.center[2] + 50) / distance];
      expect(Math.abs(Math.cos(yaw) * (radial[0] ?? 0) - Math.sin(yaw) * (radial[1] ?? 0))).toBeLessThan(1e-9);
      // Neighbouring slabs overlap, so nothing slips between them.
      expect(solid.halfExtents[0] * 2).toBeGreaterThan(2 * 42 * Math.tan(Math.PI / 16));
    }
    const east = solids.find((solid) => solid.center[0] > 140);
    // Sunk two metres into the ground it stands on, so no gap shows under it.
    expect(east).toBeDefined();
    expect((east?.center[1] ?? 0) - (east?.halfExtents[1] ?? 0)).toBe(3);
    const west = solids.find((solid) => solid.center[0] < 60);
    expect(west).toBeDefined();
    expect((west?.center[1] ?? 0) - (west?.halfExtents[1] ?? 0)).toBe(-2);
  });
});
