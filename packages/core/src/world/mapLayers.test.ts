import { describe, expect, it } from "bun:test";
import {
  MAP_LAYER_TONE_COLORS,
  mapLayerColor,
  pointInMapZone,
  type MapZoneShape,
} from "./mapLayers";

describe("pointInMapZone circle", () => {
  const circle: MapZoneShape = { kind: "circle", center: [0, 0], radius: 10 };

  it("is true for a point inside the radius", () => {
    expect(pointInMapZone(circle, 5, 5)).toBe(true);
  });

  it("is true for a point exactly on the edge", () => {
    expect(pointInMapZone(circle, 10, 0)).toBe(true);
  });

  it("is false for a point outside the radius", () => {
    expect(pointInMapZone(circle, 20, 0)).toBe(false);
  });
});

describe("pointInMapZone rect", () => {
  const axisAligned: MapZoneShape = { kind: "rect", center: [0, 0], w: 10, d: 4 };
  const rotated: MapZoneShape = { kind: "rect", center: [0, 0], w: 10, d: 4, rotate: Math.PI / 2 };

  it("is true for a point inside an axis-aligned rect", () => {
    expect(pointInMapZone(axisAligned, 4, 1)).toBe(true);
  });

  it("is false for a point outside an axis-aligned rect", () => {
    expect(pointInMapZone(axisAligned, 6, 1)).toBe(false);
  });

  it("is true for a point inside a rotated rect but outside the same axis-aligned rect", () => {
    expect(pointInMapZone(axisAligned, 1, 4)).toBe(false);
    expect(pointInMapZone(rotated, 1, 4)).toBe(true);
  });
});

describe("pointInMapZone polygon (concave)", () => {
  const crown: MapZoneShape = {
    kind: "polygon",
    points: [
      [0, 0],
      [10, 0],
      [10, 10],
      [5, 4],
      [0, 10],
    ],
  };

  it("is true for a point inside the body, below the notch", () => {
    expect(pointInMapZone(crown, 5, 1)).toBe(true);
  });

  it("is true for a point inside a prong beside the notch", () => {
    expect(pointInMapZone(crown, 1, 8)).toBe(true);
  });

  it("is false for a point in the concave notch between the prongs", () => {
    expect(pointInMapZone(crown, 5, 8)).toBe(false);
  });

  it("is false for a point outside the polygon entirely", () => {
    expect(pointInMapZone(crown, -1, 5)).toBe(false);
  });
});

describe("mapLayerColor", () => {
  it("falls back to the neutral tone color when tone is undefined", () => {
    expect(mapLayerColor(undefined)).toBe(MAP_LAYER_TONE_COLORS.neutral);
  });

  it("resolves an explicit tone to its color", () => {
    expect(mapLayerColor("danger")).toBe(MAP_LAYER_TONE_COLORS.danger);
  });
});
