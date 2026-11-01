import { expect, test } from "bun:test";

import { changeStatPool, createStatPool } from "../parts";
import { tickCooldown } from "../time/cooldown";

/**
 * @recipe Cooldown ability
 * A cost drawn from a Meter and a countdown that gates the next cast.
 */
test("cooldown ability", () => {
  let mana = createStatPool({ max: 100 });
  let cooldown = 0;
  const cast = () => {
    if (cooldown > 0 || mana.current < 30) return false;
    mana = changeStatPool(mana, -30).pool;
    cooldown = 5;
    return true;
  };

  expect(cast()).toBe(true);
  expect(cast()).toBe(false);
  cooldown = tickCooldown(cooldown, 4);
  expect(cast()).toBe(false);
  cooldown = tickCooldown(cooldown, 1);
  expect([cast(), mana.current]).toEqual([true, 40]);
  cooldown = tickCooldown(cooldown, 5);
  expect(cast()).toBe(true);
  cooldown = tickCooldown(cooldown, 5);
  expect(cast()).toBe(false);
});
