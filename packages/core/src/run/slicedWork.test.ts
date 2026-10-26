import { describe, expect, test } from "bun:test";

import { runSliced, runToEnd, SlicedWorkCancelled, type SlicedJob } from "./slicedWork";

function* countTo(limit: number, tick: () => void): SlicedJob<number> {
  let total = 0;
  for (let index = 0; index < limit; index += 1) {
    total += index;
    tick();
    yield;
  }
  return total;
}

describe("runSliced", () => {
  test("hands the thread back once a slice spends its budget, and returns the job's value", async () => {
    let clock = 0;
    let yields = 0;
    const run = runSliced(countTo(10, () => (clock += 3)), {
      budgetMs: 8,
      now: () => clock,
      yieldThread: async () => {
        yields += 1;
      },
    });
    expect(await run.done).toBe(45);
    // 3 ms per step against an 8 ms budget: three steps a slice, so ten steps take four slices.
    expect(yields).toBe(3);
  });

  test("cancel stops before the next slice", async () => {
    let steps = 0;
    const handle: { cancel?: () => void } = {};
    const run = runSliced(countTo(100, () => (steps += 1)), {
      budgetMs: 0,
      yieldThread: async () => {
        await Promise.resolve();
        handle.cancel?.();
      },
    });
    handle.cancel = run.cancel;
    await expect(run.done).rejects.toBeInstanceOf(SlicedWorkCancelled);
    expect(steps).toBe(1);
  });

  test("a job that throws rejects the run", async () => {
    function* broken(): SlicedJob<number> {
      yield;
      throw new Error("bad terrain");
    }
    await expect(runSliced(broken(), { yieldThread: async () => {} }).done).rejects.toThrow("bad terrain");
  });
});

describe("runToEnd", () => {
  test("gives the same value as the sliced run, synchronously", () => {
    expect(runToEnd(countTo(10, () => {}))).toBe(45);
  });
});
