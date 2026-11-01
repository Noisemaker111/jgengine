import { expect, test } from "bun:test";

import { changeMeter, createMeter, tickMeter, tierAt } from "../parts";

/**
 * @recipe Combo meter
 * A Meter that fills on every hit and drains once you stop for a moment, with a Ladder naming the multiplier.
 */
test("combo meter", () => {
  let combo = createMeter({ max: 20, current: 0 });
  const multipliers = [{ id: 1, at: 0 }, { id: 2, at: 5 }, { id: 3, at: 10 }];
  const hit = () => (combo = changeMeter(combo, 1).meter);
  const wait = (dt: number) => (combo = tickMeter(combo, { decay: 4, decayDelay: 2 }, dt).meter);
  const multiplier = () => tierAt(multipliers, combo.pool.current)?.id;

  for (let n = 0; n < 12; n += 1) hit();
  expect(multiplier()).toBe(3);
  wait(1.9);
  expect(multiplier()).toBe(3);
  wait(1.1);
  expect(multiplier()).toBe(2);
  wait(10);
  expect(multiplier()).toBe(1);
});
