import { describe, expect, test } from "bun:test";

import type { Vec2 } from "./geometry";
import {
  autoRoof,
  createSurfacePaint,
  createWallDrawTool,
  footprintFromWalls,
  isEnclosed,
  wallSegments,
} from "./walls";

const square: Vec2[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];

describe("walls", () => {
  test("wallSegments closes the loop when asked", () => {
    expect(wallSegments(square, false)).toHaveLength(3);
    expect(wallSegments(square, true)).toHaveLength(4);
  });

  test("isEnclosed detects a path whose end returns to the start", () => {
    expect(isEnclosed([...square, [0.1, 0.1]])).toBe(true);
    expect(isEnclosed(square.slice(0, 2))).toBe(false);
  });

  test("footprintFromWalls derives the aabb and area of an enclosed room", () => {
    const fp = footprintFromWalls(square)!;
    expect(fp.aabb).toEqual({ minX: 0, minZ: 0, maxX: 4, maxZ: 4 });
    expect(fp.area).toBe(16);
    expect(fp.perimeter).toBe(16);
  });

  test("autoRoof lays a ridge along the longer axis above the footprint", () => {
    const fp = footprintFromWalls([
      [0, 0],
      [8, 0],
      [8, 4],
      [0, 4],
    ])!;
    const roof = autoRoof(fp, { style: "gable", eaveHeight: 3, pitch: 0.5, overhang: 0 });
    expect(roof.apexHeight).toBeGreaterThan(3);
    expect(roof.ridge[0][1]).toBeCloseTo(2);
    expect(roof.ridge[1][1]).toBeCloseTo(2);
    expect(roof.faces).toHaveLength(2);
  });

  test("hip roof adds two end faces", () => {
    const fp = footprintFromWalls(square)!;
    const roof = autoRoof(fp, { style: "hip" });
    expect(roof.faces).toHaveLength(4);
  });

  test("wallDrawTool auto-encloses when the path returns near the start", () => {
    const tool = createWallDrawTool({ closeTolerance: 0.5 });
    tool.addPoint([0, 0]);
    tool.addPoint([4, 0]);
    tool.addPoint([4, 4]);
    tool.addPoint([0, 4]);
    expect(tool.isClosed()).toBe(false);
    tool.addPoint([0.1, 0.1]);
    expect(tool.isClosed()).toBe(true);
    const fp = tool.footprint();
    expect(fp?.area).toBe(16);
    expect(tool.roof()).not.toBeNull();
  });

  test("surface paint stores floor and wall surfaces independently", () => {
    const paint = createSurfacePaint();
    paint.paint("floor", "2,3", "oak");
    paint.paint("wall", "seg-0", "brick");
    expect(paint.get("floor", "2,3")).toBe("oak");
    expect(paint.get("wall", "seg-0")).toBe("brick");
    const restored = createSurfacePaint();
    restored.restore(paint.snapshot());
    expect(restored.get("floor", "2,3")).toBe("oak");
  });
});
