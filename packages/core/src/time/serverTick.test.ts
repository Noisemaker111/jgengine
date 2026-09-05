import { describe, expect, test } from "bun:test";
import { planServerTick, tickRunCount } from "./serverTick";

const SYSTEMS = [
  { id: "fast", intervalMs: 5_000 },
  { id: "slow", intervalMs: 30_000 },
] as const;

describe("planServerTick", () => {
  test("runs every system on the first heartbeat", () => {
    const plan = planServerTick(SYSTEMS, {}, 1_000);
    expect(plan.due).toEqual([
      { id: "fast", runs: 1 },
      { id: "slow", runs: 1 },
    ]);
    expect(plan.anchors).toEqual({ fast: 1_000, slow: 1_000 });
  });

  test("only runs systems whose interval elapsed", () => {
    const first = planServerTick(SYSTEMS, {}, 1_000);
    const plan = planServerTick(SYSTEMS, first.anchors, 6_000);
    expect(plan.due).toEqual([{ id: "fast", runs: 1 }]);
    expect(plan.anchors).toEqual({ fast: 6_000, slow: 1_000 });
  });

  test("drops anchors for systems removed from the pipeline", () => {
    const plan = planServerTick(SYSTEMS, { retired: 500, fast: 1_000, slow: 1_000 }, 2_000);
    expect(plan.due).toEqual([]);
    expect(plan.anchors).toEqual({ fast: 1_000, slow: 1_000 });
  });

  test("schedules multi-interval catch-up runs when the heartbeat stalls", () => {
    const plan = planServerTick(SYSTEMS, { fast: 1_000, slow: 1_000 }, 16_000);
    expect(plan.due).toEqual([{ id: "fast", runs: 3 }]);
    expect(plan.anchors).toEqual({ fast: 16_000, slow: 1_000 });
  });

  test("bounds catch-up runs and resyncs the anchor past the max", () => {
    const plan = planServerTick(SYSTEMS, { fast: 0, slow: 0 }, 100_000, { maxCatchUp: 2 });
    expect(plan.due).toEqual([
      { id: "fast", runs: 2 },
      { id: "slow", runs: 2 },
    ]);
    expect(plan.anchors).toEqual({ fast: 100_000, slow: 100_000 });
  });

  test("advances anchors by whole intervals when catch-up stays under the bound", () => {
    const plan = planServerTick([{ id: "pulse", intervalMs: 1_000 }], { pulse: 10_000 }, 12_500, {
      maxCatchUp: 5,
    });
    expect(plan.due).toEqual([{ id: "pulse", runs: 2 }]);
    expect(plan.anchors).toEqual({ pulse: 12_000 });
  });

  test("tickRunCount reports multiplicity and zero for a system that is not due", () => {
    const plan = planServerTick(SYSTEMS, { fast: 1_000, slow: 1_000 }, 16_000);
    expect(tickRunCount(plan, "fast")).toBe(3);
    expect(tickRunCount(plan, "slow")).toBe(0);
  });
});

test("tick plans preserve online player batching and reject unbounded batch sizes", () => {
  expect(planServerTick([{ id: "income", intervalMs: 1000, scope: "onlinePlayers", batchSize: 25 }], {}, 0).due).toEqual([{ id: "income", runs: 1, scope: "onlinePlayers", batchSize: 25 }]);
  expect(() => planServerTick([{ id: "income", intervalMs: 1000, batchSize: NaN }], {}, 0)).toThrow();
});
