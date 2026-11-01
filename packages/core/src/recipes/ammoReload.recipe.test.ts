import { expect, test } from "bun:test";

import { changeStatPool, createStatPool } from "../parts";
import { tickCooldown } from "../time/cooldown";

/**
 * @recipe Ammo and reload
 * The magazine and the reserve are two Meters, and a countdown gates firing while the reload runs.
 */
test("ammo and reload", () => {
  let magazine = createStatPool({ max: 30 });
  let reserve = createStatPool({ max: 120, current: 40 });
  let reloading = 0;
  const fire = () => reloading === 0 && magazine.current > 0 && ((magazine = changeStatPool(magazine, -1).pool), true);
  const reload = () => {
    const moved = changeStatPool(reserve, -(magazine.max - magazine.current)).applied;
    reserve = changeStatPool(reserve, moved).pool;
    magazine = changeStatPool(magazine, -moved).pool;
    reloading = 2;
  };

  for (let n = 0; n < 30; n += 1) fire();
  expect(fire()).toBe(false);
  reload();
  expect(fire()).toBe(false);
  reloading = tickCooldown(reloading, 2);
  expect([fire(), magazine.current, reserve.current]).toEqual([true, 29, 10]);
});
