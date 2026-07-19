import { describe, expect, test } from "bun:test";

import {
  clampTextScale,
  COLORBLIND_MATRICES,
  createAccessibilityStore,
  DEFAULT_ACCESSIBILITY,
  reducedMotionDuration,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
} from "./accessibility";

describe("clampTextScale", () => {
  test("clamps to the supported range and coerces NaN to 1", () => {
    expect(clampTextScale(0.1)).toBe(TEXT_SCALE_MIN);
    expect(clampTextScale(5)).toBe(TEXT_SCALE_MAX);
    expect(clampTextScale(1.25)).toBe(1.25);
    expect(clampTextScale(Number.NaN)).toBe(1);
  });
});

describe("reducedMotionDuration", () => {
  test("passes the duration through unless reduced motion is on", () => {
    const on = createAccessibilityStore({ reducedMotion: true }).get();
    expect(reducedMotionDuration(DEFAULT_ACCESSIBILITY, 400)).toBe(400);
    expect(reducedMotionDuration(on, 400)).toBe(0);
    expect(reducedMotionDuration(on, 400, 80)).toBe(80);
  });
});

describe("COLORBLIND_MATRICES", () => {
  test("none has no matrix; each other mode is a 20-value feColorMatrix string", () => {
    expect(COLORBLIND_MATRICES.none).toBeNull();
    for (const mode of ["protanopia", "deuteranopia", "tritanopia", "grayscale"] as const) {
      const values = COLORBLIND_MATRICES[mode];
      expect(values).not.toBeNull();
      expect(values!.trim().split(/\s+/)).toHaveLength(20);
    }
  });
});

describe("createAccessibilityStore", () => {
  test("defaults, partial set (clamped), and reset", () => {
    const store = createAccessibilityStore();
    expect(store.get()).toEqual(DEFAULT_ACCESSIBILITY);
    store.set({ textScale: 9, colorblind: "deuteranopia" });
    expect(store.get().textScale).toBe(TEXT_SCALE_MAX);
    expect(store.get().colorblind).toBe("deuteranopia");
    store.reset();
    expect(store.get()).toEqual(DEFAULT_ACCESSIBILITY);
  });

  test("notifies only on an actual change", () => {
    const store = createAccessibilityStore();
    let hits = 0;
    const off = store.subscribe(() => { hits += 1; });
    store.set({ reducedMotion: true });
    store.set({ reducedMotion: true }); // no-op
    off();
    store.set({ highContrast: true });
    expect(hits).toBe(1);
  });

  test("snapshot/restore round-trips and clamps restored text scale", () => {
    const store = createAccessibilityStore({ captions: true, textScale: 1.5 });
    const snap = JSON.parse(JSON.stringify(store.snapshot()));
    const restored = createAccessibilityStore();
    restored.restore(snap);
    expect(restored.get().captions).toBe(true);
    expect(restored.get().textScale).toBe(1.5);
    restored.restore({ textScale: 99 });
    expect(restored.get().textScale).toBe(TEXT_SCALE_MAX);
  });
});
