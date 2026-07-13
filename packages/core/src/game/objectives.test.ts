import { describe, expect, test } from "bun:test";

import { evaluateObjective, evaluateObjectives, type ThresholdObjective } from "./objectives";

describe("evaluateObjective", () => {
  test("atLeast tracks progress up to the target", () => {
    const objective: ThresholdObjective = { id: "pop", target: 2500 };
    const half = evaluateObjective(objective, 1250);
    expect(half.met).toBe(false);
    expect(half.progress).toBeCloseTo(0.5);
    const done = evaluateObjective(objective, 3000);
    expect(done.met).toBe(true);
    expect(done.progress).toBe(1);
  });

  test("atMost is met while under the target and degrades above it", () => {
    const objective: ThresholdObjective = { id: "carbon", target: 6, direction: "atMost" };
    expect(evaluateObjective(objective, 4).met).toBe(true);
    expect(evaluateObjective(objective, 4).progress).toBe(1);
    const over = evaluateObjective(objective, 12);
    expect(over.met).toBe(false);
    expect(over.progress).toBeCloseTo(0.5);
  });
});

describe("evaluateObjectives", () => {
  const objectives: ThresholdObjective[] = [
    { id: "pop", target: 2000 },
    { id: "jobs", target: 1000 },
    { id: "carbon", target: 6, direction: "atMost" },
  ];

  test("rolls up met count, completion, and mean progress from a value map", () => {
    const summary = evaluateObjectives(objectives, { pop: 2000, jobs: 500, carbon: 4 });
    expect(summary.met).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.complete).toBe(false);
    expect(summary.progress).toBeCloseTo((1 + 0.5 + 1) / 3);
  });

  test("accepts a lookup function and reports completion", () => {
    const summary = evaluateObjectives(objectives, () => 10000);
    expect(summary.complete).toBe(false);
    const allMet = evaluateObjectives([{ id: "a", target: 1 }], () => 5);
    expect(allMet.complete).toBe(true);
  });

  test("missing metrics default to zero", () => {
    const summary = evaluateObjectives([{ id: "ghost", target: 10 }], {});
    expect(summary.statuses[0]!.value).toBe(0);
    expect(summary.statuses[0]!.met).toBe(false);
  });
});
