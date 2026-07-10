import { describe, expect, test } from "bun:test";
import { TOTAL_MAIN_LENGTH, forkBranches, mainCumulative } from "../world/canyon";
import { pendingFeintTriggers, truckDistanceAt, truckPositionAt, truckSeedById } from "./truckSchedule";

describe("truck schedule determinism", () => {
  test("position is a pure function of t given the same trigger history", () => {
    const history = { [forkBranches[0].id]: true };
    const a = truckPositionAt(40, "border-push", history);
    const b = truckPositionAt(40, "border-push", history);
    expect(a).toEqual(b);
  });

  test("a different trigger history changes the position while inside a triggered fork window", () => {
    const fork = forkBranches[0];
    const seed = truckSeedById("border-push");
    const t = (mainCumulative[fork.fromIndex] + 5) / seed.pace;
    const feinted = truckPositionAt(t, "border-push", { [fork.id]: true });
    const held = truckPositionAt(t, "border-push", { [fork.id]: false });
    expect(feinted.onBranchId).toBe(fork.id);
    expect(held.onBranchId).toBeNull();
    expect(feinted.position).not.toEqual(held.position);
  });

  test("distance is monotonic and capped at the total main length", () => {
    const early = truckDistanceAt(1, "border-push");
    const late = truckDistanceAt(10, "border-push");
    expect(late).toBeGreaterThan(early);
    expect(truckDistanceAt(100_000, "border-push")).toBe(TOTAL_MAIN_LENGTH);
  });

  test("faster seeds reach a given distance sooner", () => {
    const rookie = truckDistanceAt(20, "rookie-run");
    const ghost = truckDistanceAt(20, "ghost-run");
    expect(ghost).toBeGreaterThan(rookie);
  });
});

describe("pendingFeintTriggers", () => {
  test("fires once per fork as the truck's main distance crosses the lookahead point", () => {
    const fork = forkBranches[0];
    const seed = truckSeedById("border-push");
    const triggerDistance = mainCumulative[fork.fromIndex] - seed.feintLookahead;
    const pending = pendingFeintTriggers(triggerDistance - 1, triggerDistance + 1, {}, "border-push");
    expect(pending.some((check) => check.forkId === fork.id)).toBe(true);
  });

  test("does not re-fire for a fork already present in trigger history", () => {
    const fork = forkBranches[0];
    const seed = truckSeedById("border-push");
    const triggerDistance = mainCumulative[fork.fromIndex] - seed.feintLookahead;
    const pending = pendingFeintTriggers(triggerDistance - 1, triggerDistance + 1, { [fork.id]: true }, "border-push");
    expect(pending.some((check) => check.forkId === fork.id)).toBe(false);
  });
});
