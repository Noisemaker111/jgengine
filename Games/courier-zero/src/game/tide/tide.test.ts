import { describe, expect, test } from "bun:test";
import {
  MAX_DROWNS,
  SURGE_INTERVAL_SECONDS,
  TIDE_STAGES,
  nextSurgeLevel,
  passabilityAt,
  secondsToNextSurge,
  tideLevelAt,
  tideStageIndexAt,
  waterDepthAt,
} from "./catalog";

describe("tide schedule math", () => {
  test("stage index holds for the whole interval then advances", () => {
    expect(tideStageIndexAt(0)).toBe(0);
    expect(tideStageIndexAt(SURGE_INTERVAL_SECONDS - 0.01)).toBe(0);
    expect(tideStageIndexAt(SURGE_INTERVAL_SECONDS)).toBe(1);
    expect(tideStageIndexAt(SURGE_INTERVAL_SECONDS * 2)).toBe(2);
  });

  test("clamps to the final stage once the schedule is exhausted", () => {
    const lastIndex = TIDE_STAGES.length - 1;
    expect(tideStageIndexAt(SURGE_INTERVAL_SECONDS * 100)).toBe(lastIndex);
    expect(secondsToNextSurge(SURGE_INTERVAL_SECONDS * lastIndex)).toBeNull();
  });

  test("tide level rises monotonically stage over stage", () => {
    const levels = TIDE_STAGES.map((stage) => stage.level);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
  });

  test("nextSurgeLevel previews the level after the next surge tick", () => {
    expect(nextSurgeLevel(0)).toBe(TIDE_STAGES[1]!.level);
    expect(nextSurgeLevel(SURGE_INTERVAL_SECONDS + 1)).toBe(TIDE_STAGES[2]!.level);
    const lastStageStart = SURGE_INTERVAL_SECONDS * (TIDE_STAGES.length - 1);
    expect(nextSurgeLevel(lastStageStart)).toBe(tideLevelAt(lastStageStart));
  });

  test("secondsToNextSurge counts down within a stage", () => {
    expect(secondsToNextSurge(10)).toBeCloseTo(SURGE_INTERVAL_SECONDS - 10, 5);
  });
});

describe("passability rule", () => {
  test("ground above tide is dry", () => {
    expect(passabilityAt(waterDepthAt(5, 2))).toBe("dry");
  });

  test("shallow water below the wade threshold is wadeable", () => {
    expect(passabilityAt(waterDepthAt(0, 0.6))).toBe("wade");
  });

  test("ground below tide past the threshold is blocked", () => {
    expect(passabilityAt(waterDepthAt(-2, 1))).toBe("blocked");
  });

  test("MAX_DROWNS is a positive cap", () => {
    expect(MAX_DROWNS).toBeGreaterThan(0);
  });
});
