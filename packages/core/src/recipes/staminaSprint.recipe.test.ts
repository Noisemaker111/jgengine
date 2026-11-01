import { expect, test } from "bun:test";

import { changeMeter, createMeter, tickMeter } from "../parts";

/**
 * @recipe Stamina sprint
 * A Meter drained while sprinting that only regenerates a moment after the last drain.
 */
test("stamina sprint", () => {
  let stamina = createMeter({ max: 100 });
  const rest = (dt: number) => (stamina = tickMeter(stamina, { regen: 15, regenDelay: 1.5 }, dt).meter);
  const sprint = (dt: number) => {
    if (stamina.pool.current <= 0) return false;
    stamina = changeMeter(stamina, -20 * dt).meter;
    return true;
  };

  for (let second = 0; second < 5; second += 1) sprint(1);
  expect(stamina.pool.current).toBe(0);
  expect(sprint(1)).toBe(false);
  rest(1);
  expect(stamina.pool.current).toBe(0);
  rest(3);
  expect(stamina.pool.current).toBeGreaterThan(0);
  expect(sprint(1)).toBe(true);
});
