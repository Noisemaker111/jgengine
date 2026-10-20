import { describe, expect, test } from "bun:test";

import { buildRoadRibbon } from "@jgengine/core/world/roads";

import {
  createSurfaceRibbonMaterial,
  resolvePathSurface,
  ribbonEdgeMargin,
  ribbonSurfaceFrame,
} from "./surfaceRibbonMaterial";

describe("resolvePathSurface", () => {
  test("routes default to dirt with a soft edge and ruts", () => {
    const style = resolvePathSurface("route", 5, undefined)!;
    expect(style.surface).toBe("dirt");
    expect(style.feather).toBeGreaterThan(0.5);
    expect(style.wear).toBe(1);
  });

  test("road kind paves with a near-hard edge", () => {
    const style = resolvePathSurface("road", 9, undefined)!;
    expect(style.surface).toBe("road");
    expect(style.feather).toBeLessThan(0.4);
    expect(style.wear).toBeLessThan(1);
  });

  test("meta.surface picks the surface and meta overrides tune it", () => {
    const style = resolvePathSurface("route", 4, { surface: "gravel", edgeSoftness: 0, wear: 0.2 })!;
    expect(style.surface).toBe("gravel");
    expect(style.feather).toBe(0);
    expect(ribbonEdgeMargin(style)).toBe(0);
    expect(style.wear).toBeCloseTo(0.2);
  });

  test("opt-out returns null", () => {
    expect(resolvePathSurface("route", 4, { surfaceDetail: false })).toBeNull();
    expect(resolvePathSurface("route", 4, { surface: false })).toBeNull();
  });
});

describe("ribbonSurfaceFrame", () => {
  test("measures along, signed across and distance to end per ribbon", () => {
    const ribbon = buildRoadRibbon([[0, 0], [0, 10]], 4, () => 0, { maxSegmentLength: 5 });
    const frame = ribbonSurfaceFrame([ribbon.positions, ribbon.positions]);
    expect(frame.length).toBe(ribbon.positions.length * 2);
    expect(frame[0]).toBe(0);
    expect(Math.abs(frame[1]!)).toBeCloseTo(2);
    expect(frame[4]).toBeCloseTo(-frame[1]!);
    expect(frame[2]).toBeCloseTo(10);
    const last = ribbon.positions.length - 6;
    expect(frame[last]).toBeCloseTo(10);
    expect(frame[last + 2]).toBeCloseTo(0);
    // The second ribbon restarts at its own start.
    expect(frame[ribbon.positions.length]).toBe(0);
  });
});

describe("createSurfaceRibbonMaterial", () => {
  test("soft edge turns on blending and the edge define; hard edge stays opaque", () => {
    const soft = createSurfaceRibbonMaterial({ color: "#96764e", halfWidth: 2.5, surface: "dirt", feather: 0.9, warp: 0.4, wear: 1 });
    expect(soft.transparent).toBe(true);
    expect(soft.defines?.["JG_RIBBON_EDGE"]).toBe("");
    expect(soft.defines?.["JG_RIBBON_WEAR"]).toBe("");
    const hard = createSurfaceRibbonMaterial({ color: "#33363f", halfWidth: 4.5, surface: "asphalt", quality: "low" });
    expect(hard.transparent).toBe(false);
    expect(hard.defines?.["JG_RIBBON_EDGE"]).toBeUndefined();
    expect(hard.defines?.["JG_SURFACE_LOW"]).toBe("");
    expect(hard.defines?.["JG_RIBBON_PAVED"]).toBe("");
    expect(hard.customProgramCacheKey()).not.toBe(soft.customProgramCacheKey());
  });
});
