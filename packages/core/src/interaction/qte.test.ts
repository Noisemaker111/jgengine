import { describe, expect, test } from "bun:test";
import { evaluateQteSequence, pendingQteStep, qteProgress, type QteStep } from "./qte";

const steps: QteStep[] = [
  { id: "cast", action: "mouse0", windowStart: 0, windowEnd: 1 },
  { id: "set", action: "mouse0", windowStart: 1, windowEnd: 2 },
  { id: "reel", action: "keyE", windowStart: 2, windowEnd: 3.5 },
];

describe("evaluateQteSequence", () => {
  test("succeeds when every input lands in its window with the right action", () => {
    const outcome = evaluateQteSequence(steps, [
      { action: "mouse0", at: 0.4 },
      { action: "mouse0", at: 1.2 },
      { action: "keyE", at: 3 },
    ]);
    expect(outcome).toEqual({ status: "success" });
  });

  test("fails on a missing input", () => {
    const outcome = evaluateQteSequence(steps, [{ action: "mouse0", at: 0.4 }]);
    expect(outcome).toEqual({ status: "fail", atStep: "set", reason: "missed-window" });
  });

  test("fails when the input arrives before the window opens", () => {
    const outcome = evaluateQteSequence(steps, [{ action: "mouse0", at: -0.1 }]);
    expect(outcome).toEqual({ status: "fail", atStep: "cast", reason: "too-early" });
  });

  test("fails when the input arrives after the window closes", () => {
    const outcome = evaluateQteSequence(steps, [{ action: "mouse0", at: 1.5 }]);
    expect(outcome).toEqual({ status: "fail", atStep: "cast", reason: "missed-window" });
  });

  test("fails on the wrong action", () => {
    const outcome = evaluateQteSequence(steps, [{ action: "keyE", at: 0.4 }]);
    expect(outcome).toEqual({ status: "fail", atStep: "cast", reason: "wrong-action" });
  });
});

describe("pendingQteStep", () => {
  test("returns the step whose window contains the elapsed time", () => {
    expect(pendingQteStep(steps, 1.5)?.id).toBe("set");
    expect(pendingQteStep(steps, 10)).toBeNull();
  });
});

describe("qteProgress", () => {
  test("reports the fraction of steps whose window has already closed", () => {
    expect(qteProgress(steps, -1)).toBe(0);
    expect(qteProgress(steps, 1.1)).toBeCloseTo(1 / 3);
    expect(qteProgress(steps, 10)).toBe(1);
  });
});
