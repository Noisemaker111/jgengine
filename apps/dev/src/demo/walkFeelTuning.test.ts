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
    // At 60 Hz the fall and the rise land on the same tick (both 0.1833 s), so this comparison sits on
    // its own boundary. Sample at 240 Hz, where the 1.6x fall gravity resolves to 0.1667 s fall against
    // a 0.1875 s rise. The tolerance is one 240 Hz tick — the sampling resolution — because anything
    // smaller fails a legitimate next-tick rounding and anything larger (1/60) would swallow the signal.
    const fine = measureMovement(WEIGHTY_FEEL, { dt: 1 / 240 });
    const rise = fine.apexTime;
    const fall = fine.airTime - fine.apexTime;
    expect(fall, `fall ${fall.toFixed(4)}s against rise ${rise.toFixed(4)}s at 240 Hz`).toBeLessThan(rise - 1 / 240);
    expect(weighty.timeToTopSpeed).toBeGreaterThan(0.2);
    expect(weighty.stopDistance).toBeGreaterThan(0.2);
  });

  test("same top speed, so the difference is feel rather than pace", () => {
    expect(floaty.topSpeed).toBeCloseTo(weighty.topSpeed, 3);
  });
});
