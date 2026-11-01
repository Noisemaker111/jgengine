import { expect, test } from "bun:test";

import { changeMeter, createMeter, evaluatePredicate, tickMeter } from "../parts";

/**
 * @recipe Taming by feeding
 * A taming Meter filled by food, worth more when a Requirement says it is the creature's favourite, and draining if you stop.
 */
test("taming by feeding", () => {
  let trust = createMeter({ max: 100, current: 0 });
  const favourite = { in: ["food", ["berry", "meat"]] } as const;
  const feed = (food: string) => (trust = changeMeter(trust, evaluatePredicate(favourite, { food }) ? 30 : 10).meter);
  const wait = (dt: number) => (trust = tickMeter(trust, { decay: 1, decayDelay: 20 }, dt).meter);

  feed("bread");
  expect(trust.pool.current).toBe(10);
  wait(40);
  expect(trust.pool.current).toBe(0);
  for (let n = 0; n < 3; n += 1) feed("berry");
  expect(trust.pool.current).toBe(90);
  feed("meat");
  expect(changeMeter(trust, 0).change.hitMax).toBe(true);
});
