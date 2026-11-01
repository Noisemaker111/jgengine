import { expect, test } from "bun:test";

import { changeStatPool, createMeter, createStatPool, tickMeter } from "../parts";

/**
 * @recipe Shop with prices and stock
 * Gold is a Meter, each item's stock is a Meter that regenerates (the restock), and the price is data beside it.
 */
test("shop with prices and stock", () => {
  let gold = createStatPool({ max: 1000, current: 120 });
  let potion = createMeter({ max: 3 });
  const price = 50;
  const buy = () => {
    if (potion.pool.current < 1 || gold.current < price) return false;
    gold = changeStatPool(gold, -price).pool;
    potion = { ...potion, pool: changeStatPool(potion.pool, -1).pool };
    return true;
  };

  expect([buy(), buy(), buy()]).toEqual([true, true, false]);
  expect(gold.current).toBe(20);
  gold = changeStatPool(gold, 500).pool;
  expect(buy()).toBe(true);
  expect(potion.pool.current).toBe(0);
  potion = tickMeter(potion, { regen: 1 / 60 }, 120).meter;
  expect(potion.pool.current).toBe(2);
});
