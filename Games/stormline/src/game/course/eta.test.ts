import { describe, expect, test } from "bun:test";
import { FORKS } from "./catalog";
import { etaSeconds, forkEtas } from "./eta";

describe("stormline fork ETA math", () => {
  test("eta is infinite when stopped", () => {
    expect(etaSeconds(100, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  test("eta is zero once the remaining distance is covered", () => {
    expect(etaSeconds(0, 20)).toBe(0);
    expect(etaSeconds(-5, 20)).toBe(0);
  });

  test("eta scales inversely with speed", () => {
    expect(etaSeconds(200, 20)).toBeCloseTo(10, 5);
    expect(etaSeconds(200, 40)).toBeCloseTo(5, 5);
  });

  test("the fast spur eta reflects lower grip on the storm-side lane", () => {
    const fork = FORKS[0]!;
    const truckProgress = fork.forkProgress;
    const etas = forkEtas(fork, truckProgress, 20, 0.8);
    expect(etas.fastSeconds).toBeGreaterThan(etas.safeSeconds);
  });

  test("both spurs report the same remaining distance to the shared gate", () => {
    const fork = FORKS[1]!;
    const truckProgress = fork.forkProgress + 5;
    const fullGrip = forkEtas(fork, truckProgress, 20, 1);
    expect(fullGrip.fastSeconds).toBeCloseTo(fullGrip.safeSeconds, 5);
  });
});
