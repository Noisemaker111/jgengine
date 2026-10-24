import { describe, expect, test } from "bun:test";

import { createOccluderGrid, type OccluderBox } from "./occluderGrid";

const BOUNDS = { minX: 0, minZ: 0, maxX: 300, maxZ: 300 };

/** A wall across the z axis at x 90..120, covering z 40..160, 30 m tall: 3x12 whole cells at 10 m. */
const WALL: OccluderBox = { minX: 90, minY: 0, minZ: 40, maxX: 120, maxY: 30, maxZ: 160 };

function grid(boxes: readonly OccluderBox[] = [WALL], extra: { cellSize?: number; minHeight?: number } = {}) {
  const built = createOccluderGrid({ bounds: BOUNDS, cellSize: extra.cellSize ?? 10, minHeight: extra.minHeight });
  built.build(boxes);
  return built;
}

describe("occluderGrid", () => {
  test("rejects a cell behind the wall and keeps a cell beside it", () => {
    const built = grid();
    expect(built.isPointHidden(0, 2, 105, 200, 1, 105)).toBe(true);
    expect(built.isPointHidden(0, 2, 105, 200, 1, 285)).toBe(false);
  });

  test("a camera above the wall sees over it", () => {
    const built = grid();
    expect(built.isPointHidden(0, 50, 105, 200, 1, 105)).toBe(false);
  });

  test("builds once: a second look at the grid runs no geometry work", () => {
    const built = grid();
    const afterBuild = built.stats();
    expect(afterBuild.occluders).toBe(1);
    expect(afterBuild.blockerCells).toBe(36);
    const camera = { x: 0, y: 2, z: 105 };
    const box = { minX: 191, minY: 0, minZ: 101, maxX: 199, maxY: 2, maxZ: 109 };
    expect(built.isBoxHidden(camera, box)).toBe(true);
    const afterTest = built.stats();
    expect(afterTest.occluders).toBe(afterBuild.occluders);
    expect(afterTest.buildMs).toBe(afterBuild.buildMs);
    expect(afterTest.tests).toBe(1);
    expect(afterTest.rejected).toBe(1);
  });

  test("keeps a box that spans a cell edge, because it could be partly visible", () => {
    const built = grid();
    const spanning = { minX: 191, minY: 0, minZ: 101, maxX: 209, maxY: 2, maxZ: 109 };
    expect(built.isBoxHidden({ x: 0, y: 2, z: 105 }, spanning)).toBe(false);
  });

  test("ignores occluders shorter than the trusted height", () => {
    const fence: OccluderBox = { minX: 90, minY: 0, minZ: 40, maxX: 120, maxY: 2, maxZ: 160 };
    const built = grid([fence], { minHeight: 6 });
    expect(built.stats().occluders).toBe(0);
    expect(built.isPointHidden(0, 2, 105, 200, 1, 105)).toBe(false);
  });

  test("exposes the built field as serializable state", () => {
    const built = grid();
    const state = built.toState();
    const restored = createOccluderGrid({ bounds: BOUNDS, cellSize: 10, restore: state });
    expect(restored.stats().blockerCells).toBe(36);
    expect(restored.isPointHidden(0, 2, 105, 200, 1, 105)).toBe(true);
  });

  test("the visibility adapter reports the same rejection", () => {
    const built = grid();
    const tester = built.tester();
    const camera = {
      kind: "perspective" as const,
      position: [0, 2, 100] as [number, number, number],
      target: [1, 2, 100] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      fovDeg: 60,
      aspect: 16 / 9,
      near: 0.1,
      far: 1000,
    };
    const hidden = { minX: 191, minY: 0, minZ: 101, maxX: 199, maxY: 2, maxZ: 109 };
    const beside = { minX: 191, minY: 0, minZ: 281, maxX: 199, maxY: 2, maxZ: 289 };
    expect(tester.isOccluded({ camera, bounds: { ...hidden, centerX: 195, centerY: 1, centerZ: 105, radius: 5 }, occluders: [] })).toBe(true);
    expect(tester.isOccluded({ camera, bounds: { ...beside, centerX: 195, centerY: 1, centerZ: 285, radius: 5 }, occluders: [] })).toBe(false);
  });
});

