import { describe, expect, test } from "bun:test";

import { measureMovement } from "@jgengine/core/movement/movementProbe";

import { FLOATY_FEEL, WEIGHTY_FEEL } from "./walkFeelTuning";

describe("walk feel demo characters", () => {
  const floaty = measureMovement(FLOATY_FEEL);
  const weighty = measureMovement(WEIGHTY_FEEL);

  test("the floaty platformer jumps high, hangs, steers in the air and hops on a tap", () => {
    expect(floaty.jumpHeight).toBeGreaterThan(2);
    expect(floaty.airTime).toBeGreaterThan(1.4);
    expect(floaty.airControlReach).toBeGreaterThan(6);
    expect(floaty.tapJumpHeight).toBeLessThan(floaty.jumpHeight * 0.6);
    expect(floaty.timeToTopSpeed).toBeLessThan(0.1);
  });

  test("the weighty shooter jumps low, drops fast, commits to its arc and carries momentum", () => {
    expect(weighty.jumpHeight).toBeLessThan(0.6);
    expect(weighty.airTime).toBeLessThan(0.4);
    expect(weighty.airControlReach).toBeLessThan(0.5);
    expect(weighty.airTime - weighty.apexTime).toBeLessThan(weighty.apexTime);
    expect(weighty.timeToTopSpeed).toBeGreaterThan(0.2);
    expect(weighty.stopDistance).toBeGreaterThan(0.2);
  });

  test("same top speed, so the difference is feel rather than pace", () => {
    expect(floaty.topSpeed).toBeCloseTo(weighty.topSpeed, 3);
  });
});
