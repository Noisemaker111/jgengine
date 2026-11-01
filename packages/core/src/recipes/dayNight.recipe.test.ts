import { expect, test } from "bun:test";

import { createPhaseSchedule } from "../parts";

/**
 * @recipe Day and night
 * Phases that loop: each day part holds for its own seconds and the cycle wraps from night back to dawn.
 */
test("day and night", () => {
  const clock = createPhaseSchedule({
    loop: true,
    phases: [
      { state: "dawn", durationSeconds: 60 },
      { state: "day", durationSeconds: 300 },
      { state: "dusk", durationSeconds: 60 },
      { state: "night", durationSeconds: 180 },
    ],
  });

  expect(clock.state()).toBe("dawn");
  expect(clock.tick(60).map((t) => t.to)).toEqual(["day"]);
  expect(clock.tick(360).map((t) => t.to)).toEqual(["dusk", "night"]);
  expect(clock.tick(180).map((t) => t.wrapped)).toEqual([true]);
  expect(clock.state()).toBe("dawn");
});
