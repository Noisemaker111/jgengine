import { describe, expect, test } from "bun:test";
import {
  resolveInspectionCameraConfig,
  resolveInspectionZoomToCursor,
  seedInspectionCamera,
} from "./inspectionCameraMath";

describe("resolveInspectionCameraConfig", () => {
  test("applies defaults when unset", () => {
    const config = resolveInspectionCameraConfig();
    expect(config.anchor).toBe("target");
    expect(config.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(config.initialDistance).toBe(6);
    expect(config.initialPosition).toBeNull();
    expect(config.minDistance).toBe(2);
    expect(config.maxDistance).toBe(20);
    expect(config.minPolarAngle).toBe(0);
    expect(config.maxPolarAngle).toBeCloseTo(Math.PI);
    expect(config.pan).toBe(true);
  });

  test("merges patch over defaults", () => {
    const config = resolveInspectionCameraConfig({
      anchor: "cursor",
      target: { x: 1, y: 2, z: 3 },
      pan: false,
      minDistance: 1,
    });
    expect(config.anchor).toBe("cursor");
    expect(config.target).toEqual({ x: 1, y: 2, z: 3 });
    expect(config.pan).toBe(false);
    expect(config.minDistance).toBe(1);
    expect(config.maxDistance).toBe(20);
  });

  test("fills partial target and initialPosition with zeros", () => {
    const config = resolveInspectionCameraConfig({
      target: { y: 4 },
      initialPosition: { x: 5 },
    });
    expect(config.target).toEqual({ x: 0, y: 4, z: 0 });
    expect(config.initialPosition).toEqual({ x: 5, y: 0, z: 0 });
  });
});

describe("seedInspectionCamera", () => {
  test("derives camera position from initialDistance behind target when initialPosition is unset", () => {
    const config = resolveInspectionCameraConfig({ target: { x: 1, y: 2, z: 3 }, initialDistance: 10 });
    const seeded = seedInspectionCamera(config);
    expect(seeded.target).toEqual({ x: 1, y: 2, z: 3 });
    expect(seeded.camera).toEqual({ x: 1, y: 2 + 4, z: 3 - 10 });
  });

  test("uses initialPosition verbatim when set", () => {
    const config = resolveInspectionCameraConfig({
      target: { x: 0, y: 0, z: 0 },
      initialPosition: { x: 5, y: 6, z: 7 },
    });
    const seeded = seedInspectionCamera(config);
    expect(seeded.camera).toEqual({ x: 5, y: 6, z: 7 });
    expect(seeded.target).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("resolveInspectionZoomToCursor", () => {
  test("only the cursor anchor enables native zoomToCursor", () => {
    expect(resolveInspectionZoomToCursor("cursor")).toBe(true);
    expect(resolveInspectionZoomToCursor("target")).toBe(false);
    expect(resolveInspectionZoomToCursor("center")).toBe(false);
  });
});
