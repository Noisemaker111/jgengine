import { describe, expect, test } from "bun:test";

import {
  advancePreview,
  clipEntriesFromRef,
  initialClipPreviewState,
  MAX_PREVIEW_SPEED,
  MIN_PREVIEW_SPEED,
  previewAnimationConfig,
  scrubPreview,
  selectPreviewClip,
  setPreviewLoop,
  setPreviewPlaying,
  setPreviewSpeed,
  togglePreviewPlaying,
} from "./clipPreview";

describe("clipEntriesFromRef", () => {
  test("derives clip list with classified roles in catalog order", () => {
    const entries = clipEntriesFromRef({ clips: ["Idle", "Walking_A", "Armature|Attack", "Blend_Shape"] });
    expect(entries).toEqual([
      { name: "Idle", role: "idle" },
      { name: "Walking_A", role: "walk" },
      { name: "Armature|Attack", role: "attack" },
      { name: "Blend_Shape", role: null },
    ]);
  });

  test("returns empty for non-rigged refs", () => {
    expect(clipEntriesFromRef(undefined)).toEqual([]);
    expect(clipEntriesFromRef(null)).toEqual([]);
    expect(clipEntriesFromRef({})).toEqual([]);
    expect(clipEntriesFromRef({ clips: [] })).toEqual([]);
  });
});

describe("clip preview driver", () => {
  test("initial state auto-plays a given clip and idles when clipless", () => {
    expect(initialClipPreviewState("Idle")).toEqual({ clipName: "Idle", playing: true, loop: true, speed: 1, time: 0 });
    expect(initialClipPreviewState()).toEqual({ clipName: null, playing: false, loop: true, speed: 1, time: 0 });
  });

  test("selecting a clip resets the playhead and starts playing", () => {
    const scrubbed = scrubPreview(initialClipPreviewState("Idle"), 3);
    const next = selectPreviewClip(scrubbed, "Run");
    expect(next.clipName).toBe("Run");
    expect(next.time).toBe(0);
    expect(next.playing).toBe(true);
  });

  test("play/pause toggles, but never plays without a clip", () => {
    const playing = initialClipPreviewState("Idle");
    expect(togglePreviewPlaying(playing).playing).toBe(false);
    expect(setPreviewPlaying(playing, true).playing).toBe(true);
    expect(setPreviewPlaying(initialClipPreviewState(), true).playing).toBe(false);
  });

  test("loop toggle and speed clamp", () => {
    const base = initialClipPreviewState("Idle");
    expect(setPreviewLoop(base, false).loop).toBe(false);
    expect(setPreviewSpeed(base, 2).speed).toBe(2);
    expect(setPreviewSpeed(base, 99).speed).toBe(MAX_PREVIEW_SPEED);
    expect(setPreviewSpeed(base, 0).speed).toBe(MIN_PREVIEW_SPEED);
    expect(setPreviewSpeed(base, Number.NaN).speed).toBe(1);
  });

  test("scrub sets absolute time and pauses", () => {
    const scrubbed = scrubPreview(initialClipPreviewState("Idle"), 1.25);
    expect(scrubbed.time).toBe(1.25);
    expect(scrubbed.playing).toBe(false);
    expect(scrubPreview(scrubbed, -5).time).toBe(0);
  });

  test("advance wraps while looping and clamps+stops otherwise", () => {
    const looping = { clipName: "Idle", playing: true, loop: true, speed: 1, time: 1.8 };
    const wrapped = advancePreview(looping, 0.5, 2);
    expect(wrapped.time).toBeCloseTo(0.3, 6);
    expect(wrapped.playing).toBe(true);

    const once = { clipName: "Idle", playing: true, loop: false, speed: 1, time: 1.8 };
    const clamped = advancePreview(once, 0.5, 2);
    expect(clamped.time).toBe(2);
    expect(clamped.playing).toBe(false);

    // speed scales the step
    expect(advancePreview({ ...looping, time: 0 }, 0.1, 2).time).toBeCloseTo(0.1, 6);
    expect(advancePreview({ ...looping, time: 0, speed: 2 }, 0.1, 2).time).toBeCloseTo(0.2, 6);
  });

  test("advance is a no-op when paused, clipless, or duration unknown", () => {
    const paused = { clipName: "Idle", playing: false, loop: true, speed: 1, time: 0.5 };
    expect(advancePreview(paused, 0.1, 2)).toBe(paused);
    const clipless = { clipName: null, playing: true, loop: true, speed: 1, time: 0 };
    expect(advancePreview(clipless, 0.1, 2)).toBe(clipless);
    const noDuration = { clipName: "Idle", playing: true, loop: true, speed: 1, time: 0 };
    expect(advancePreview(noDuration, 0.1, 0)).toBe(noDuration);
  });

  test("animation config freeruns while playing and holds a paused pose otherwise", () => {
    const playing = { clipName: "Run", playing: true, loop: false, speed: 1.5, time: 0.4 };
    expect(previewAnimationConfig(playing)).toEqual({ clip: "Run", loop: false, timeScale: 1.5 });

    const paused = { ...playing, playing: false };
    expect(previewAnimationConfig(paused)).toEqual({ clip: "Run", loop: false, timeScale: 1.5, paused: true, time: 0.4 });

    expect(previewAnimationConfig(initialClipPreviewState())).toBeUndefined();
  });
});
