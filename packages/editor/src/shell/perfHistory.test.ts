import { expect, test } from "bun:test";

import type { EditorPerfSample } from "../session";
import {
  createPerfHistoryStore,
  frameBudgetFromStats,
  latestPhases,
  PERF_HISTORY_CAPACITY,
  samplesHaveFrameBudget,
  seriesAverage,
  seriesAverageDefined,
  sparklinePoints,
} from "./perfHistory";

function sample(sampledAt: number, frameMs = 16, extra: Partial<EditorPerfSample> = {}): EditorPerfSample {
  return { fps: 60, frameMs, drawCalls: 100, triangles: 1_000, sampledAt, active: true, ...extra };
}

test("push records fresh samples and dedupes repeated poll reads", () => {
  const store = createPerfHistoryStore();
  store.push(sample(1));
  store.push(sample(1));
  store.push(sample(2));
  expect(store.getSamples()).toHaveLength(2);
});

test("history is bounded and clear resets the dedup cursor", () => {
  const store = createPerfHistoryStore();
  for (let index = 0; index < PERF_HISTORY_CAPACITY + 10; index += 1) store.push(sample(index));
  expect(store.getSamples()).toHaveLength(PERF_HISTORY_CAPACITY);
  store.clear();
  expect(store.getSamples()).toHaveLength(0);
  store.push(sample(3));
  expect(store.getSamples()).toHaveLength(1);
});

test("pause stops recording until resumed", () => {
  const store = createPerfHistoryStore();
  store.push(sample(1));
  store.setPaused(true);
  expect(store.isPaused()).toBe(true);
  store.push(sample(2));
  expect(store.getSamples()).toHaveLength(1);
  store.setPaused(false);
  store.push(sample(3));
  expect(store.getSamples()).toHaveLength(2);
});

test("seriesAverage and sparklinePoints handle empty and scaled input", () => {
  expect(seriesAverage([])).toBe(0);
  expect(seriesAverage([10, 20, 30])).toBe(20);
  expect(sparklinePoints([], 100, 40, 33)).toBe("");
  const points = sparklinePoints([0, 16.5, 33], 100, 40, 33);
  const pairs = points.split(" ").map((pair) => pair.split(",").map(Number));
  expect(pairs).toHaveLength(3);
  expect(pairs[0]![1]).toBe(40);
  expect(pairs[2]![1]).toBe(0);
  expect(pairs[1]![0]).toBe(50);
});

test("seriesAverageDefined ignores missing optional values", () => {
  expect(seriesAverageDefined([])).toBe(0);
  expect(seriesAverageDefined([undefined, undefined])).toBe(0);
  expect(seriesAverageDefined([10, undefined, 30])).toBe(20);
});

test("frameBudgetFromStats returns null when the tracker has no samples", () => {
  expect(frameBudgetFromStats(null)).toBeNull();
});

test("frameBudgetFromStats maps sim/outside and trims empty phases", () => {
  const budget = frameBudgetFromStats({
    avgSimMs: 4.567,
    avgOutsideMs: 11.234,
    phases: [
      { name: "physics", avgMs: 2.3456 },
      { name: "idle", avgMs: 0 },
      { name: "", avgMs: 1 },
      { name: "ai", avgMs: 1.111 },
    ],
  });
  expect(budget).toEqual({
    simMs: 4.57,
    outsideMs: 11.23,
    phases: [
      { name: "physics", avgMs: 2.35 },
      { name: "ai", avgMs: 1.11 },
    ],
  });
});

test("frameBudgetFromStats omits phases key when none are positive", () => {
  const budget = frameBudgetFromStats({
    avgSimMs: 2,
    avgOutsideMs: 8,
    phases: [{ name: "x", avgMs: 0 }],
  });
  expect(budget).toEqual({ simMs: 2, outsideMs: 8 });
  expect(budget?.phases).toBeUndefined();
});

test("samplesHaveFrameBudget and latestPhases only use real fields", () => {
  expect(samplesHaveFrameBudget([sample(1)])).toBe(false);
  expect(latestPhases([sample(1)])).toEqual([]);

  const withBudget = [
    sample(1),
    sample(2, 16, { simMs: 3, outsideMs: 10, phases: [{ name: "tick", avgMs: 1.5 }] }),
    sample(3, 16, { simMs: 4, outsideMs: 9 }),
  ];
  expect(samplesHaveFrameBudget(withBudget)).toBe(true);
  // Newest sample with phases wins even if a later sample dropped the list.
  expect(latestPhases(withBudget)).toEqual([{ name: "tick", avgMs: 1.5 }]);
  expect(latestPhases([sample(4, 16, { simMs: 1, outsideMs: 2, phases: [{ name: "net", avgMs: 0.4 }] })])).toEqual([
    { name: "net", avgMs: 0.4 },
  ]);
});
