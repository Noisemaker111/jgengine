import { expect, test } from "bun:test";

import { createPacedSchedule, createPhaseSchedule, createStatGraph } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Timed event
 * A Schedule opens the event, Phases hold it open for a while, and while it is open a Modifiers source doubles experience.
 */
test("timed event", () => {
  const opens = createPacedSchedule({ firstAt: 100, every: 1000 }, seededRng("event"));
  const event = createPhaseSchedule({ phases: [{ state: "closed" }, { state: "open", durationSeconds: 300, next: "closed" }] });
  const xp = createStatGraph({ inputs: [{ id: "gain", base: 10 }] }).create();
  const update = (now: number, dt: number) => {
    if (opens.due(now).length > 0) event.enter("open");
    for (const t of event.tick(dt)) if (t.to === "closed") xp.removeSource("double");
    if (event.state() === "open") xp.addSource("double", { gain: { source: "double", op: "mul", value: 2 } });
  };

  update(50, 50);
  expect(xp.get("gain")).toBe(10);
  update(100, 50);
  expect(xp.get("gain")).toBe(20);
  update(150, 300);
  expect(event.state()).toBe("closed");
  expect(xp.get("gain")).toBe(10);
});
