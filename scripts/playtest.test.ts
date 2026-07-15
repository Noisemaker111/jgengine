import { describe, expect, test } from "bun:test";

import {
  longestFlatWindowMs,
  progressDelta,
  summarizePlaytest,
  type ProbeSample,
} from "./playtest";

const OPTS = { seed: 7, softlockThresholdMs: 1500, epsilon: 1e-3 };

function ramp(from: number, to: number, count: number, step: number): ProbeSample[] {
  return Array.from({ length: count }, (_, index) => ({
    t: index * step,
    metrics: { x: from + ((to - from) * index) / (count - 1) },
  }));
}

describe("progressDelta", () => {
  test("net change per metric across the run", () => {
    const samples: ProbeSample[] = [
      { t: 0, metrics: { score: 0, x: 5 } },
      { t: 100, metrics: { score: 3, x: 8 } },
      { t: 200, metrics: { score: 7, x: 2 } },
    ];
    expect(progressDelta(samples)).toEqual({ score: 7, x: -3 });
  });

  test("handles metrics that appear partway through", () => {
    const samples: ProbeSample[] = [
      { t: 0, metrics: { x: 1 } },
      { t: 100, metrics: { x: 2, phase: 1 } },
      { t: 200, metrics: { x: 3, phase: 2 } },
    ];
    expect(progressDelta(samples)).toEqual({ x: 2, phase: 1 });
  });
});

describe("longestFlatWindowMs", () => {
  test("advancing metric is never flat", () => {
    expect(longestFlatWindowMs(ramp(0, 50, 20, 100), OPTS.epsilon)).toBe(0);
  });

  test("frozen metric is flat for its whole span", () => {
    const stuck: ProbeSample[] = Array.from({ length: 20 }, (_, index) => ({
      t: index * 100,
      metrics: { x: 4.2 },
    }));
    expect(longestFlatWindowMs(stuck, OPTS.epsilon)).toBe(1900);
  });

  test("sub-epsilon jitter still reads as flat", () => {
    const jitter: ProbeSample[] = Array.from({ length: 10 }, (_, index) => ({
      t: index * 100,
      metrics: { x: 1 + (index % 2 === 0 ? 0 : 1e-4) },
    }));
    expect(longestFlatWindowMs(jitter, OPTS.epsilon)).toBe(900);
  });

  test("circling back to start reads as moving, not stuck", () => {
    const circle: ProbeSample[] = Array.from({ length: 21 }, (_, index) => ({
      t: index * 100,
      metrics: { x: Math.sin((index / 20) * Math.PI * 2) * 5 },
    }));
    // ends where it began, but the wide range across the window keeps it non-flat
    expect(longestFlatWindowMs(circle, OPTS.epsilon)).toBeLessThan(600);
  });

  test("one moving metric masks another that is flat", () => {
    const mixed: ProbeSample[] = Array.from({ length: 20 }, (_, index) => ({
      t: index * 100,
      metrics: { score: 0, x: index },
    }));
    expect(longestFlatWindowMs(mixed, OPTS.epsilon)).toBe(0);
  });

  test("finds the flat tail after early motion", () => {
    const samples: ProbeSample[] = [
      ...ramp(0, 10, 5, 100).map((s) => s),
      ...Array.from({ length: 20 }, (_, index) => ({ t: 500 + index * 100, metrics: { x: 10 } })),
    ];
    // last ramp point (x=10 @ t=400) already matches the flat tail → span t=400..2400
    expect(longestFlatWindowMs(samples, OPTS.epsilon)).toBe(2000);
  });
});

describe("summarizePlaytest", () => {
  test("advancing loop: progress, no softlock", () => {
    const result = summarizePlaytest(ramp(0, 40, 30, 100), OPTS);
    expect(result.probed).toBe(true);
    expect(result.softlocked).toBe(false);
    expect(result.totalProgress).toBeCloseTo(40, 5);
    expect(result.progressDelta.x).toBeCloseTo(40, 5);
    expect(result.framesElapsed).toBe(30);
    expect(result.seed).toBe(7);
  });

  test("stuck loop past threshold flags a softlock", () => {
    const stuck: ProbeSample[] = Array.from({ length: 30 }, (_, index) => ({
      t: index * 100,
      metrics: { x: 3, score: 0 },
    }));
    const result = summarizePlaytest(stuck, OPTS);
    expect(result.softlocked).toBe(true);
    expect(result.softlockWindowMs).toBeGreaterThanOrEqual(OPTS.softlockThresholdMs);
    expect(result.totalProgress).toBe(0);
  });

  test("flat but too-short run does not flag (nothing to judge yet)", () => {
    const brief: ProbeSample[] = [
      { t: 0, metrics: { x: 1 } },
      { t: 200, metrics: { x: 1 } },
    ];
    const result = summarizePlaytest(brief, OPTS);
    expect(result.softlocked).toBe(false);
    expect(result.durationMs).toBe(200);
  });

  test("no probe: empty samples read as unprobed, never softlocked", () => {
    const result = summarizePlaytest([], OPTS);
    expect(result.probed).toBe(false);
    expect(result.softlocked).toBe(false);
    expect(result.framesElapsed).toBe(0);
    expect(result.totalProgress).toBe(0);
  });
});
