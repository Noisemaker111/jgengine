import { describe, expect, test } from "bun:test";

import { awaitDriveCondition, conditionMatches, type DriveSession } from "./driveSteps";

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
