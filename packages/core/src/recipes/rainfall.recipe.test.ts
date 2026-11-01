import { expect, test } from "bun:test";

import { createPacedSchedule, createPhaseSchedule, pickWeighted } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Weather event
 * A Schedule decides when weather rolls in, a Table picks which, and Phases hold it for a while before clear skies return.
 */
test("weather event", () => {
  const rng = seededRng("weather");
  const rolls = createPacedSchedule({ firstAt: 300, every: 600, jitter: 60 }, rng);
  const sky = createPhaseSchedule({
    phases: [{ state: "clear" }, { state: "rain", durationSeconds: 120, next: "clear" }, { state: "storm", durationSeconds: 60, next: "clear" }],
  });
  const weather = [{ id: "rain", weight: 3 }, { id: "storm", weight: 1 }];
  const update = (now: number, dt: number) => {
    if (rolls.due(now).length > 0) sky.enter(pickWeighted(rng, weather, (w) => w.weight)?.id === "storm" ? "storm" : "rain");
    sky.tick(dt);
  };

  update(299, 1);
  expect(sky.state()).toBe("clear");
  update(300, 1);
  expect(sky.state()).not.toBe("clear");
  update(301, 130);
  expect(sky.state()).toBe("clear");
});
