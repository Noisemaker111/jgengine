import { describe, expect, test } from "bun:test";
import type { StrikeZoneSpec } from "./catalog";
import { cycleLengthMs, isStrikeActive, strikeCycle, strikeHitsProgress } from "./strikes";

const ZONE: StrikeZoneSpec = {
  id: "test-zone",
  forkIndex: 1,
  progress: 500,
  radius: 12,
  windupMs: 1000,
  activeMs: 400,
  cooldownMs: 2000,
  phaseOffsetMs: 0,
};

describe("stormline lightning strike timing", () => {
  test("starts in the windup phase", () => {
    expect(strikeCycle(ZONE, 0).phase).toBe("windup");
    expect(strikeCycle(ZONE, 0).windupProgress).toBe(0);
  });

  test("windup progress ramps from 0 to 1 across the windup window", () => {
    expect(strikeCycle(ZONE, 500).windupProgress).toBeCloseTo(0.5, 5);
    expect(isStrikeActive(ZONE, 500)).toBe(false);
  });

  test("transitions to active once the windup elapses", () => {
    expect(strikeCycle(ZONE, ZONE.windupMs).phase).toBe("active");
    expect(isStrikeActive(ZONE, ZONE.windupMs + 100)).toBe(true);
  });

  test("transitions to cooldown once the active window elapses", () => {
    const cooldownStart = ZONE.windupMs + ZONE.activeMs;
    expect(strikeCycle(ZONE, cooldownStart).phase).toBe("cooldown");
    expect(isStrikeActive(ZONE, cooldownStart)).toBe(false);
  });

  test("repeats the cycle deterministically", () => {
    const cycle = cycleLengthMs(ZONE);
    expect(strikeCycle(ZONE, 500).phase).toBe(strikeCycle(ZONE, 500 + cycle).phase);
    expect(isStrikeActive(ZONE, ZONE.windupMs + 50)).toBe(isStrikeActive(ZONE, ZONE.windupMs + 50 + cycle));
  });

  test("a phase offset staggers the cycle", () => {
    const staggered: StrikeZoneSpec = { ...ZONE, phaseOffsetMs: 1000 };
    expect(strikeCycle(staggered, 0).phase).toBe("active");
  });

  test("hits only while the truck's progress is within the zone radius", () => {
    expect(strikeHitsProgress(ZONE, ZONE.progress)).toBe(true);
    expect(strikeHitsProgress(ZONE, ZONE.progress + ZONE.radius - 1)).toBe(true);
    expect(strikeHitsProgress(ZONE, ZONE.progress + ZONE.radius + 5)).toBe(false);
    expect(strikeHitsProgress(ZONE, ZONE.progress - ZONE.radius - 5)).toBe(false);
  });
});
