import { describe, expect, test } from "bun:test";
import type { ObjectVisibilityOverrides } from "@jgengine/core/visibility/settings";
import {
  resolveOverrides,
  mergeCullingSettings,
  mergeStreamingSettings,
  DEFAULT_CULLING_SETTINGS,
  DEFAULT_STREAMING_SETTINGS,
} from "@jgengine/core/visibility/settings";

describe("resolveOverrides", () => {
  test("object layer wins over layer, scene, and global", () => {
    const object: ObjectVisibilityOverrides = { minRenderDistance: 1 };
    const layer: ObjectVisibilityOverrides = { minRenderDistance: 2 };
    const scene: ObjectVisibilityOverrides = { minRenderDistance: 3 };
    const global: ObjectVisibilityOverrides = { minRenderDistance: 4 };
    const resolved = resolveOverrides(object, layer, scene, global);
    expect(resolved.minRenderDistance).toBe(1);
  });

  test("layer wins over scene and global when object leaves the key undefined", () => {
    const object: ObjectVisibilityOverrides = {};
    const layer: ObjectVisibilityOverrides = { minRenderDistance: 2 };
    const scene: ObjectVisibilityOverrides = { minRenderDistance: 3 };
    const global: ObjectVisibilityOverrides = { minRenderDistance: 4 };
    const resolved = resolveOverrides(object, layer, scene, global);
    expect(resolved.minRenderDistance).toBe(2);
  });

  test("scene wins over global when object and layer leave the key undefined", () => {
    const scene: ObjectVisibilityOverrides = { minRenderDistance: 3 };
    const global: ObjectVisibilityOverrides = { minRenderDistance: 4 };
    const resolved = resolveOverrides(undefined, undefined, scene, global);
    expect(resolved.minRenderDistance).toBe(3);
  });

  test("global is the last resort", () => {
    const global: ObjectVisibilityOverrides = { minRenderDistance: 4 };
    const resolved = resolveOverrides(undefined, undefined, undefined, global);
    expect(resolved.minRenderDistance).toBe(4);
  });

  test("defaults when every layer is undefined", () => {
    const resolved = resolveOverrides();
    expect(resolved.alwaysVisible).toBe(false);
    expect(resolved.neverUnload).toBe(false);
    expect(resolved.minRenderDistance).toBeUndefined();
    expect(resolved.maxRenderDistance).toBeUndefined();
    expect(resolved.preloadMargin).toBeUndefined();
    expect(resolved.cullingDisabled).toBe(false);
    expect(resolved.streamingDisabled).toBe(false);
    expect(resolved.classification).toBeUndefined();
    expect(resolved.bounds).toBeUndefined();
    expect(resolved.customVisibility).toBeUndefined();
    expect(resolved.pinned).toBe(false);
  });

  test("alwaysVisible, pinned, and cullingDisabled default to false and pick up true from any layer", () => {
    const resolved = resolveOverrides(undefined, { alwaysVisible: true, pinned: true, cullingDisabled: true });
    expect(resolved.alwaysVisible).toBe(true);
    expect(resolved.pinned).toBe(true);
    expect(resolved.cullingDisabled).toBe(true);
  });

  test("layers are skipped independently per key", () => {
    const object: ObjectVisibilityOverrides = { alwaysVisible: true };
    const scene: ObjectVisibilityOverrides = { maxRenderDistance: 50 };
    const resolved = resolveOverrides(object, undefined, scene, undefined);
    expect(resolved.alwaysVisible).toBe(true);
    expect(resolved.maxRenderDistance).toBe(50);
  });
});

describe("mergeCullingSettings / mergeStreamingSettings", () => {
  test("mergeCullingSettings overlays a patch onto the base", () => {
    const merged = mergeCullingSettings(DEFAULT_CULLING_SETTINGS, { hysteresis: 9, enabled: false });
    expect(merged.hysteresis).toBe(9);
    expect(merged.enabled).toBe(false);
    expect(merged.frustumCulling).toBe(DEFAULT_CULLING_SETTINGS.frustumCulling);
  });

  test("mergeStreamingSettings overlays a patch onto the base", () => {
    const merged = mergeStreamingSettings(DEFAULT_STREAMING_SETTINGS, { maxLoadsPerFrame: 1 });
    expect(merged.maxLoadsPerFrame).toBe(1);
    expect(merged.preloadMargin).toBe(DEFAULT_STREAMING_SETTINGS.preloadMargin);
  });
});

describe("default settings sanity", () => {
  test("DEFAULT_CULLING_SETTINGS favors correctness over aggressive rejection", () => {
    expect(DEFAULT_CULLING_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_CULLING_SETTINGS.frustumCulling).toBe(true);
    expect(DEFAULT_CULLING_SETTINGS.distanceCulling).toBe(true);
    expect(DEFAULT_CULLING_SETTINGS.occlusionCulling).toBe(false);
    expect(DEFAULT_CULLING_SETTINGS.defaultMinRenderDistance).toBe(0);
    expect(DEFAULT_CULLING_SETTINGS.defaultMaxRenderDistance).toBe(Infinity);
    expect(DEFAULT_CULLING_SETTINGS.preloadMargin).toBeGreaterThan(0);
    expect(DEFAULT_CULLING_SETTINGS.hysteresis).toBeGreaterThan(0);
  });

  test("DEFAULT_STREAMING_SETTINGS enables streaming with sane bounds", () => {
    expect(DEFAULT_STREAMING_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_STREAMING_SETTINGS.preloadMargin).toBeGreaterThan(0);
    expect(DEFAULT_STREAMING_SETTINGS.unloadGraceSeconds).toBeGreaterThan(0);
    expect(DEFAULT_STREAMING_SETTINGS.maxLoadsPerFrame).toBeGreaterThan(0);
    expect(DEFAULT_STREAMING_SETTINGS.maxUnloadsPerFrame).toBeGreaterThan(0);
    expect(DEFAULT_STREAMING_SETTINGS.keepResidentBytes).toBeGreaterThan(0);
  });
});
