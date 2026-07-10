import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TAP_WINDOWS,
  MAX_STRIKES,
  MERCY_RESET_VALUE,
  applyPulseDelta,
  classifyTap,
  createPulseState,
  forwardSpeed,
  isDefeated,
  isDownbeatOpen,
  nearestBeatDelta,
  resonanceActive,
  speedMultiplierForPulse,
  steeringRateForPulse,
} from "./rhythm";

const BEAT_DURATION = 60 / 120;

describe("beat window classification", () => {
  test("a tap exactly on the beat is perfect", () => {
    expect(classifyTap(BEAT_DURATION * 4, BEAT_DURATION)).toBe("perfect");
  });

  test("a tap inside the perfect window is perfect", () => {
    expect(classifyTap(BEAT_DURATION * 4 + DEFAULT_TAP_WINDOWS.perfectSec * 0.5, BEAT_DURATION)).toBe("perfect");
  });

  test("a tap just outside the perfect window but inside the good window is good", () => {
    const nowSec = BEAT_DURATION * 4 + DEFAULT_TAP_WINDOWS.perfectSec + 0.01;
    expect(classifyTap(nowSec, BEAT_DURATION)).toBe("good");
  });

  test("a tap outside the good window is a miss", () => {
    const nowSec = BEAT_DURATION * 4 + DEFAULT_TAP_WINDOWS.goodSec + 0.01;
    expect(classifyTap(nowSec, BEAT_DURATION)).toBe("miss");
  });

  test("early and late taps of equal distance classify the same", () => {
    const early = BEAT_DURATION * 4 - 0.09;
    const late = BEAT_DURATION * 4 + 0.09;
    expect(classifyTap(early, BEAT_DURATION)).toBe(classifyTap(late, BEAT_DURATION));
  });

  test("nearestBeatDelta measures signed distance to the closest beat", () => {
    expect(nearestBeatDelta(BEAT_DURATION * 2 + 0.05, BEAT_DURATION)).toBeCloseTo(0.05, 5);
    expect(nearestBeatDelta(BEAT_DURATION * 2 - 0.05, BEAT_DURATION)).toBeCloseTo(-0.05, 5);
  });
});

describe("pulse meter dynamics", () => {
  test("perfect taps gain pulse, clamped at the max", () => {
    let state = createPulseState();
    for (let i = 0; i < 50; i += 1) state = applyPulseDelta(state, 0.06);
    expect(state.value).toBe(1);
    expect(state.strikes).toBe(0);
  });

  test("draining to zero resets with mercy and records a strike", () => {
    const state = applyPulseDelta({ value: 0.05, strikes: 0 }, -0.26);
    expect(state.value).toBe(MERCY_RESET_VALUE);
    expect(state.strikes).toBe(1);
  });

  test("the third zero-strike does not forgive", () => {
    const state = applyPulseDelta({ value: 0.05, strikes: MAX_STRIKES - 1 }, -0.26);
    expect(state.value).toBe(0);
    expect(state.strikes).toBe(MAX_STRIKES);
  });

  test("isDefeated is true only once strikes reach the max", () => {
    expect(isDefeated({ value: 0, strikes: MAX_STRIKES - 1 })).toBe(false);
    expect(isDefeated({ value: 0, strikes: MAX_STRIKES })).toBe(true);
  });
});

describe("speed and steering curves from pulse", () => {
  test("speed multiplier increases monotonically with pulse", () => {
    expect(speedMultiplierForPulse(0)).toBeLessThan(speedMultiplierForPulse(0.5));
    expect(speedMultiplierForPulse(0.5)).toBeLessThan(speedMultiplierForPulse(1));
  });

  test("steering rate increases monotonically with pulse", () => {
    expect(steeringRateForPulse(0)).toBeLessThan(steeringRateForPulse(0.5));
    expect(steeringRateForPulse(0.5)).toBeLessThan(steeringRateForPulse(1));
  });

  test("pulse curves clamp outside the 0..1 domain", () => {
    expect(speedMultiplierForPulse(-1)).toBe(speedMultiplierForPulse(0));
    expect(speedMultiplierForPulse(5)).toBe(speedMultiplierForPulse(1));
  });

  test("forward speed scales with bpm and units per beat", () => {
    const slow = forwardSpeed(90, 3, 1, 0, false);
    const fast = forwardSpeed(128, 3, 1, 0, false);
    expect(fast).toBeGreaterThan(slow);
  });

  test("resonance adds a speed bonus over the same pulse", () => {
    const base = forwardSpeed(100, 3, 0.8, 0, false);
    const resonating = forwardSpeed(100, 3, 0.8, 0, true);
    expect(resonating).toBeGreaterThan(base);
  });

  test("lean boost adds on top without affecting the base curve", () => {
    const noLean = forwardSpeed(100, 3, 0.8, 0, false);
    const leaning = forwardSpeed(100, 3, 0.8, 0.2, false);
    expect(leaning).toBeGreaterThan(noLean);
  });
});

describe("beat-gated door open windows align to downbeats", () => {
  test("the door is open on the downbeat itself", () => {
    expect(isDownbeatOpen(8, 4)).toBe(true);
    expect(isDownbeatOpen(0, 4)).toBe(true);
  });

  test("the door is closed mid-bar", () => {
    expect(isDownbeatOpen(2, 4)).toBe(false);
  });

  test("the door opens within the configured window around the downbeat", () => {
    expect(isDownbeatOpen(3.7, 4, 0.8)).toBe(true);
    expect(isDownbeatOpen(4.3, 4, 0.8)).toBe(true);
  });

  test("a wider window opens earlier and closes later", () => {
    expect(isDownbeatOpen(3.2, 4, 2)).toBe(true);
    expect(isDownbeatOpen(3.2, 4, 0.2)).toBe(false);
  });
});

describe("resonance", () => {
  test("resonance activates only once the streak reaches the threshold", () => {
    expect(resonanceActive(7)).toBe(false);
    expect(resonanceActive(8)).toBe(true);
    expect(resonanceActive(32)).toBe(true);
  });
});
