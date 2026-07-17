import { describe, expect, test } from "bun:test";

import { classifyEditorPerf, EDITOR_PERF_LOW_FPS } from "./perfPill";

describe("classifyEditorPerf", () => {
  test("reports idle for a throttled at-rest loop regardless of the low wall-clock fps", () => {
    // The bug: a render-on-demand / headless-throttled editor sits at ~2fps with 1 draw / 2 tris.
    expect(classifyEditorPerf({ fps: 2.3, active: false })).toBe("idle");
    expect(classifyEditorPerf({ fps: 0, active: false })).toBe("idle");
  });

  test("never flags idle as busy even when fps is far below the low threshold", () => {
    expect(classifyEditorPerf({ fps: EDITOR_PERF_LOW_FPS - 20, active: false })).toBe("idle");
  });

  test("flags busy only for sustained low fps while actively rendering", () => {
    expect(classifyEditorPerf({ fps: 8, active: true })).toBe("busy");
    expect(classifyEditorPerf({ fps: EDITOR_PERF_LOW_FPS - 0.1, active: true })).toBe("busy");
  });

  test("reports healthy when actively rendering at or above the low threshold", () => {
    expect(classifyEditorPerf({ fps: EDITOR_PERF_LOW_FPS, active: true })).toBe("healthy");
    expect(classifyEditorPerf({ fps: 60, active: true })).toBe("healthy");
  });
});
