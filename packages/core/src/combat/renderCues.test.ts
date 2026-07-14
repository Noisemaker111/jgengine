import { describe, expect, test } from "bun:test";
import {
  advanceMotionCues,
  applyRenderAnimationEvent,
  applyRenderDeathEvent,
  applyRenderHitEvent,
  DEFAULT_RENDER_CUES,
} from "./renderCues";

describe("advanceMotionCues", () => {
  test("holds bobPhase while stationary", () => {
    const next = advanceMotionCues(DEFAULT_RENDER_CUES, 0, 1);
    expect(next.bobPhase).toBe(0);
    expect(next.speed).toBe(0);
  });

  test("advances and wraps bobPhase while moving", () => {
    const moving = advanceMotionCues(DEFAULT_RENDER_CUES, 5, 1, { cyclesPerUnit: 1 });
    expect(moving.bobPhase).toBeCloseTo(0, 5);
    const partial = advanceMotionCues(DEFAULT_RENDER_CUES, 2, 1, { cyclesPerUnit: 1 });
    expect(partial.bobPhase).toBeCloseTo(0, 5);
    const quarter = advanceMotionCues(DEFAULT_RENDER_CUES, 0.25, 1, { cyclesPerUnit: 1 });
    expect(quarter.bobPhase).toBeCloseTo(0.25, 5);
  });

  test("decays recoil toward zero and clamps at zero", () => {
    const primed = { ...DEFAULT_RENDER_CUES, recoil: 1 };
    const decayed = advanceMotionCues(primed, 0, 0.1, { recoilDecayPerSecond: 6 });
    expect(decayed.recoil).toBeCloseTo(0.4, 5);
    const clamped = advanceMotionCues(primed, 0, 5, { recoilDecayPerSecond: 6 });
    expect(clamped.recoil).toBe(0);
  });
});

describe("applyRenderAnimationEvent", () => {
  test("fire sets firing + full recoil", () => {
    const next = applyRenderAnimationEvent(DEFAULT_RENDER_CUES, "fire");
    expect(next.firing).toBe(true);
    expect(next.recoil).toBe(1);
  });

  test("reload sets reloading, reloadEnd clears it", () => {
    const reloading = applyRenderAnimationEvent(DEFAULT_RENDER_CUES, "reload");
    expect(reloading.reloading).toBe(true);
    const done = applyRenderAnimationEvent(reloading, "reloadEnd");
    expect(done.reloading).toBe(false);
  });

  test("unknown event is a no-op", () => {
    const next = applyRenderAnimationEvent(DEFAULT_RENDER_CUES, "wave");
    expect(next).toEqual(DEFAULT_RENDER_CUES);
  });
});

test("applyRenderHitEvent sets hit", () => {
  expect(applyRenderHitEvent(DEFAULT_RENDER_CUES).hit).toBe(true);
});

test("applyRenderDeathEvent sets dead", () => {
  expect(applyRenderDeathEvent(DEFAULT_RENDER_CUES).dead).toBe(true);
});
