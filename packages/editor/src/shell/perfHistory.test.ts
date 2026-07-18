import { expect, test } from "bun:test";

import type { EditorPerfSample } from "../session";
import { createPerfHistoryStore, PERF_HISTORY_CAPACITY, seriesAverage, sparklinePoints } from "./perfHistory";

function sample(sampledAt: number, frameMs = 16): EditorPerfSample {
  return { fps: 60, frameMs, drawCalls: 100, triangles: 1_000, sampledAt, active: true };
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
