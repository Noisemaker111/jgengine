import { describe, expect, test } from "bun:test";

import { parseCaptureArgs, CAPTURE_FLAGS, type CaptureStep } from "../packages/jgengine/src/templates/captureArgs";
import { runDriveSteps, type DriveStepRecord } from "./driveRun";

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
      run: async (step: CaptureStep, _index: number) => {
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

const steps = parseCaptureArgs("drive", ["--click", "Free skirmish", "--probe", "start", "--shot", "after", "--key", "KeyH:120"], CAPTURE_FLAGS).steps;

describe("runDriveSteps", () => {
  test("a failing step stops the run, and only then are the steps printed", async () => {
    const host = harness(async (step) => {
      if (step.kind === "probe") throw new Error("no probe");
      return "";
    });
    await expect(runDriveSteps(steps, host.deps)).rejects.toThrow("no probe");
    expect(host.ran.map((step) => step.kind)).toEqual(["click", "probe"]);
    expect(host.lines[0]).toBe("#1 click \"Free skirmish\" ok 26ms");
    expect(host.lines[1]).toBe("#2 probe start FAIL 26ms — no probe");
    expect(host.lines.at(-1)).toMatch(/^drive: FAILED at step 2 of 4 after \d+ms, tier n\/a$/);
    expect(host.records.map((entry) => ({ index: entry.index, pass: entry.pass }))).toEqual([
      { index: 1, pass: true },
      { index: 2, pass: false },
    ]);
  });

  test("a step that never returns fails at its budget, naming itself", async () => {
    const host = harness(async (step) => (step.kind === "probe" ? new Promise<string>(() => {}) : ""));
    await expect(runDriveSteps(steps, { ...host.deps, stepTimeoutMs: () => 20 })).rejects.toThrow(/drive step #2 probe .* hung: no result after 0s/);
    expect(host.lines.some((line) => line.startsWith("#2 probe") && line.includes("FAIL") && line.includes("hung"))).toBe(true);
  });

  test("a passing run prints one line with the tier, and one JSONL row per step", async () => {
    const host = harness(async () => "");
    const summary = await runDriveSteps(steps, { ...host.deps, tier: "ultra" });
    expect(summary).toEqual({ passed: 4, failed: 0, wallMs: expect.any(Number), virtualMs: 0 });
    expect(host.lines).toHaveLength(1);
    expect(host.lines[0]).toMatch(/^drive: 4 step\(s\) passed in \d+ms, tier ultra$/);
    expect(host.records.map((entry) => Object.keys(entry))).toEqual(Array.from({ length: 4 }, () => ["index", "name", "kind", "ms", "pass", "detail"]));
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
    expect(host.lines[0]).toContain("1200ms virtual");
  });
});
