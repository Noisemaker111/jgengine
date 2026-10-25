import { describe, expect, test } from "bun:test";

import { awaitDriveCondition, conditionMatches, holdDriveInput, type DriveInputDeps, type DriveSession } from "./driveSteps";
import { holdComplete } from "./gameSurfaceFocus";

function clocked(values: unknown[]) {
  const clock = { t: 0 };
  let reads = 0;
  const session = {
    send: async () => undefined,
    evaluate: async () => values[Math.min(reads++, values.length - 1)],
  } as unknown as DriveSession;
  const deps = {
    sleep: async (ms: number) => { clock.t += ms; },
    now: () => clock.t,
  };
  return { session, deps, elapsed: () => clock.t };
}

describe("awaitDriveCondition", () => {
  test("returns the moment the expression matches, not a fixed wait", async () => {
    const run = clocked([false, false, true]);
    const result = await awaitDriveCondition(run.session, "steps[1].before", { is: "skirmish.started" }, run.deps);
    expect(result).toEqual({ value: true, elapsedMs: 100 });
  });

  test("times out naming the label, expression, last value and elapsed time", async () => {
    const run = clocked([false]);
    await expect(awaitDriveCondition(run.session, "steps[4].before", { is: "skirmish.started", timeoutMs: 200 }, run.deps))
      .rejects.toThrow('steps[4].before: "skirmish.started" did not become true within 200ms (last value: false, elapsed 200ms)');
  });

  test("matches a declared value instead of truthiness", async () => {
    const run = clocked([2, 3]);
    const result = await awaitDriveCondition(run.session, "steps[2].after", { is: "squad.formationCount", value: 3 }, run.deps);
    expect(result.value).toBe(3);
    expect(conditionMatches(3, 3)).toBe(true);
    expect(conditionMatches("3", 3)).toBe(false);
  });

  test("reports an expression that throws instead of waiting out the timeout", async () => {
    const session = { send: async () => undefined, evaluate: async () => { throw new Error("bridge missing"); } } as unknown as DriveSession;
    await expect(awaitDriveCondition(session, "steps[0].before", { is: "menu.ready" }, { sleep: async () => {}, now: () => 0 }))
      .rejects.toThrow('steps[0].before: "menu.ready" threw bridge missing after 0ms');
  });
});

describe("holdDriveInput until", () => {
  /** A page whose position advances only while the key is down, at whatever rate frames arrive. */
  function walkingPage(stepPerPoll: number) {
    const clock = { t: 0 };
    const page = { held: false, z: 1, frames: 0, sent: [] as string[] };
    const session = {
      send: async (method: string, params?: Record<string, unknown>) => {
        if (method === "Input.dispatchKeyEvent") { page.held = params?.type === "keyDown"; page.sent.push(String(params?.type)); }
        return undefined;
      },
      evaluate: async (expression: string) => {
        if (expression.includes("__jgFrames ?? 0")) return page.frames;
        if (expression.includes("probe.z")) return page.z < -3.5;
        return true;
      },
    } as unknown as DriveSession;
    const deps = {
      focusGameSurface: () => true, holdComplete, mouseButtonForCode: () => null, gameSurfaceCenter: () => null,
      sleep: async (ms: number) => { clock.t += ms; page.frames += 1; if (page.held) page.z -= stepPerPoll; },
      now: () => clock.t,
    } as unknown as DriveInputDeps;
    return { session, deps, page, clock };
  }

  test("keeps the key down until the arrival holds, however slowly the page steps", async () => {
    for (const stride of [0.4, 0.05]) {
      const run = walkingPage(stride);
      await holdDriveInput(run.session, "KeyW", 0, run.deps, { is: "probe.z < -3.5", timeoutMs: 60_000 });
      expect(run.page.z).toBeLessThan(-3.5);
      expect(run.page.z).toBeGreaterThan(-3.5 - stride - 1e-9);
      expect(run.page.sent).toEqual(["keyDown", "keyUp"]);
    }
  });

  test("releases and fails naming the step when the arrival never comes", async () => {
    const run = walkingPage(0);
    await expect(holdDriveInput(run.session, "KeyW", 0, run.deps, { is: "probe.z < -3.5", timeoutMs: 500, label: "steps[3].until" }))
      .rejects.toThrow('steps[3].until: "probe.z < -3.5" did not become true within 500ms of holding KeyW (last value: false)');
    expect(run.page.sent).toEqual(["keyDown", "keyUp"]);
  });
});
