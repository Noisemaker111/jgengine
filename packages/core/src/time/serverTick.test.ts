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
});
