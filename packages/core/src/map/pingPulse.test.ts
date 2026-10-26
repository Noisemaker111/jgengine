import { describe, expect, test } from "bun:test";

import { pingBobOffset, pingOpacity } from "./pingPulse";

describe("pingOpacity", () => {
  test("fades in from 0 to 1 over the fade-in window", () => {
    expect(pingOpacity({ bornMs: 1000, nowMs: 1000, fadeInMs: 200 })).toBe(0);
    expect(pingOpacity({ bornMs: 1000, nowMs: 1100, fadeInMs: 200 })).toBeCloseTo(0.5, 5);
    expect(pingOpacity({ bornMs: 1000, nowMs: 1400, fadeInMs: 200 })).toBe(1);
  });

  test("a non-expiring ping stays fully opaque once faded in", () => {
    expect(pingOpacity({ bornMs: 0, nowMs: 10_000 })).toBe(1);
  });

  test("fades out over the fade-out window before expiry", () => {
    expect(pingOpacity({ bornMs: 0, nowMs: 10_000, remainingMs: 600, fadeOutMs: 600 })).toBe(1);
    expect(pingOpacity({ bornMs: 0, nowMs: 10_000, remainingMs: 300, fadeOutMs: 600 })).toBeCloseTo(0.5, 5);
    expect(pingOpacity({ bornMs: 0, nowMs: 10_000, remainingMs: 0, fadeOutMs: 600 })).toBe(0);
  });

  test("takes the minimum of fade-in and fade-out (a ping that expires mid-appearance)", () => {
    // just born (fadeIn ~0) but also about to expire (fadeOut ~0) → 0
    expect(pingOpacity({ bornMs: 1000, nowMs: 1000, remainingMs: 0 })).toBe(0);
  });
});

describe("pingBobOffset", () => {
  test("is zero at t=0 and bounded by the amplitude", () => {
    expect(pingBobOffset(0)).toBeCloseTo(0, 6);
    for (let t = 0; t < 4; t += 0.13) {
      expect(Math.abs(pingBobOffset(t, 0.2))).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });
});
