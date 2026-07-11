import { describe, expect, test } from "bun:test";
import { planServerTick } from "@jgengine/core/time/serverTick";

const SYSTEMS = [
  { id: "fast", intervalMs: 5_000 },
  { id: "slow", intervalMs: 30_000 },
] as const;

describe("planServerTick", () => {
  test("runs every system on the first heartbeat", () => {
    const plan = planServerTick(SYSTEMS, {}, 1_000);
    expect(plan.due).toEqual(["fast", "slow"]);
    expect(plan.anchors).toEqual({ fast: 1_000, slow: 1_000 });
  });

  test("only runs systems whose interval elapsed", () => {
    const first = planServerTick(SYSTEMS, {}, 1_000);
    const plan = planServerTick(SYSTEMS, first.anchors, 6_000);
    expect(plan.due).toEqual(["fast"]);
    expect(plan.anchors).toEqual({ fast: 6_000, slow: 1_000 });
  });

  test("drops anchors for systems removed from the pipeline", () => {
    const plan = planServerTick(SYSTEMS, { retired: 500, fast: 1_000, slow: 1_000 }, 2_000);
    expect(plan.due).toEqual([]);
    expect(plan.anchors).toEqual({ fast: 1_000, slow: 1_000 });
  });

  test("schedules multi-interval catch-up runs when the heartbeat stalls", () => {
    const plan = planServerTick(SYSTEMS, { fast: 1_000, slow: 1_000 }, 16_000);
    expect(plan.due.filter((id) => id === "fast")).toEqual(["fast", "fast", "fast"]);
    expect(plan.due.filter((id) => id === "slow")).toEqual([]);
    expect(plan.anchors).toEqual({ fast: 16_000, slow: 1_000 });
  });

  test("bounds catch-up runs and resyncs the anchor past the max", () => {
    const plan = planServerTick(
      SYSTEMS,
      { fast: 0, slow: 0 },
      100_000,
      { maxCatchUp: 2 },
    );
    expect(plan.due.filter((id) => id === "fast")).toEqual(["fast", "fast"]);
    expect(plan.due.filter((id) => id === "slow")).toEqual(["slow", "slow"]);
    expect(plan.anchors).toEqual({ fast: 100_000, slow: 100_000 });
  });

  test("advances anchors by whole intervals when catch-up stays under the bound", () => {
    const plan = planServerTick(
      [{ id: "pulse", intervalMs: 1_000 }],
      { pulse: 10_000 },
      12_500,
      { maxCatchUp: 5 },
    );
    expect(plan.due).toEqual(["pulse", "pulse"]);
    expect(plan.anchors).toEqual({ pulse: 12_000 });
  });
});
