import { describe, expect, test } from "bun:test";

import { parseStepFile, type CaptureStep } from "../packages/jgengine/src/templates/captureArgs";
import { AssertionMismatch, evaluateAssertStep, runDriveSteps, type DriveStepRecord } from "./driveRun";

/** A run host that records what the loop did, so the test reads behaviour rather than stdout. */
function harness(behaviour: (step: CaptureStep) => Promise<string>) {
  const lines: string[] = [];
  const records: DriveStepRecord[] = [];
  const ran: CaptureStep[] = [];
  let clock = 0;
  return {
    lines,
    records,
    ran,
    deps: {
      run: async (step: CaptureStep) => {
        ran.push(step);
        clock += 25;
        return behaviour(step);
      },
      line: (text: string) => lines.push(text),
      record: (entry: DriveStepRecord) => records.push(entry),
      now: () => {
        clock += 1;
        return clock;
      },
    },
  };
}

const steps = parseStepFile({
  steps: [
    { click: "Free skirmish" },
    { assert: "skirmish.started" },
    { shot: "after" },
    { key: "KeyH", ms: 120 },
  ],
}, "proof.json");

describe("runDriveSteps", () => {
  test("a failing assert stops the run: later steps never execute", async () => {
    const host = harness(async (step) => {
      if (step.kind === "assert") throw new AssertionMismatch(false, "assert \"skirmish.started\" is true, actual false");
      return "";
    });
    await expect(runDriveSteps(steps, host.deps)).rejects.toThrow("skirmish.started");
    expect(host.ran.map((step) => step.kind)).toEqual(["click", "assert"]);
    expect(host.lines).toContain("#2 assert \"skirmish.started\" is true FAIL actual=false 26ms");
    expect(host.records.map((entry) => ({ index: entry.index, pass: entry.pass }))).toEqual([
      { index: 1, pass: true },
      { index: 2, pass: false },
    ]);
  });

  test("a failing condition before the next step also stops at that step", async () => {
    const host = harness(async (step) => {
      if (step.kind === "shot") throw new Error("steps[2].before: \"hud.ready\" did not become true within 15000ms");
      return "";
    });
    await expect(runDriveSteps(steps, host.deps)).rejects.toThrow("did not become true");
    expect(host.ran.map((step) => step.kind)).toEqual(["click", "assert", "shot"]);
    expect(host.lines.some((line) => line.startsWith("#3 shot after FAIL") && line.includes("did not become true"))).toBe(true);
  });

  test("one log line and one JSONL row per executed step, ending with the summary", async () => {
    const host = harness(async (step) => (step.kind === "key" ? "before 18ms after 21ms" : ""));
    const summary = await runDriveSteps(steps, host.deps);
    expect(summary).toEqual({ passed: 4, failed: 0, wallMs: expect.any(Number), virtualMs: 0 });
    expect(host.lines[0]).toBe("#1 click \"Free skirmish\" ok total 26ms");
    expect(host.lines[3]).toBe("#4 key KeyH 120ms ok before 18ms after 21ms total 26ms");
    expect(host.lines.slice(-5)).toEqual(["drive: step summary", "  passed   4", "  failed   0", expect.stringContaining("  wall     "), "  virtual  0ms"]);
    const parsed = host.records.map((entry) => JSON.parse(JSON.stringify(entry)) as DriveStepRecord);
    expect(parsed).toHaveLength(parsed.length);
    expect(parsed).toHaveLength(4);
    expect(parsed.map((entry) => Object.keys(entry))).toEqual(Array.from({ length: 4 }, () => ["index", "name", "kind", "ms", "pass", "detail"]));
    expect(parsed[1]).toMatchObject({ index: 2, name: "assert \"skirmish.started\" is true", kind: "assert", pass: true });
  });

  test("the summary reports virtual time for a lockstep run", async () => {
    const host = harness(async () => "");
    let virtual = 0;
    const summary = await runDriveSteps(steps, {
      ...host.deps,
      run: async (step, index) => {
        virtual += 300;
        return host.deps.run(step, index);
      },
      virtualNow: () => virtual,
    });
    expect(summary.virtualMs).toBe(1200);
  });
});

describe("evaluateAssertStep", () => {
  const page = (value: unknown) => ({
    evaluate: async () => value,
  });

  test("passes on the expected value and fails with the actual one otherwise", async () => {
    const step = parseStepFile({ steps: [{ assert: "skirmish.units.length", is: 4, note: "four units" }] }, "proof.json")[0]!;
    if (step.kind !== "assert") throw new Error("expected an assert step");
    expect(await evaluateAssertStep(page(4), step)).toBe(4);
    await expect(evaluateAssertStep(page(3), step)).rejects.toThrow("assert \"skirmish.units.length\" is 4, actual 3 — four units");
    await expect(evaluateAssertStep(page(3), step)).rejects.toBeInstanceOf(AssertionMismatch);
    await expect(evaluateAssertStep({ evaluate: async () => { throw new Error("ReferenceError: skirmish is not defined"); } }, step))
      .rejects.toThrow("threw ReferenceError: skirmish is not defined");
  });

  test("matches strictly, so a truthy value is not a pass for true", async () => {
    const step = parseStepFile({ steps: [{ assert: "menu.buttons.length" }] }, "proof.json")[0]!;
    if (step.kind !== "assert") throw new Error("expected an assert step");
    await expect(evaluateAssertStep(page(2), step)).rejects.toBeInstanceOf(AssertionMismatch);
    expect(await evaluateAssertStep(page(true), step)).toBe(true);
  });
});
