import { expect, test } from "bun:test";

import { changeStatPool, createPhaseSchedule, createStatPool, crossThresholds } from "../parts";

/**
 * @recipe Boss with phases
 * A Meter holds the boss's health, a Ladder of health cut points reports each one crossed, and Phases advance by event, not by time.
 */
test("boss with phases", () => {
  let health = createStatPool({ max: 1000 });
  const phases = createPhaseSchedule({ phases: [{ state: "ranged" }, { state: "melee" }, { state: "enraged" }] });
  const cuts = [{ id: "melee", at: 600 }, { id: "enraged", at: 300 }];
  const hit = (damage: number) => {
    const hit = changeStatPool(health, -damage);
    for (const _ of crossThresholds(cuts, health.current, hit.pool.current)) phases.advance();
    health = hit.pool;
  };

  expect(phases.state()).toBe("ranged");
  hit(500);
  expect(phases.state()).toBe("melee");
  hit(450);
  expect(phases.state()).toBe("enraged");
  hit(900);
  expect(health.current).toBe(0);
});
