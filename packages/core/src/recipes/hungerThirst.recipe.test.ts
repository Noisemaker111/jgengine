import { expect, test } from "bun:test";

import { changeMeter, createMeter, tickMeter, tierAt } from "../parts";

/**
 * @recipe Hunger and thirst
 * Two Meters that decay at their own rates, a Ladder that names how bad it is, and eating is a fill.
 */
test("hunger and thirst", () => {
  let hunger = createMeter({ max: 100 });
  let thirst = createMeter({ max: 100 });
  const bands = [{ id: "starving", at: 0 }, { id: "hungry", at: 25 }, { id: "fed", at: 60 }];
  const live = (dt: number) => {
    hunger = tickMeter(hunger, { decay: 0.5 }, dt).meter;
    thirst = tickMeter(thirst, { decay: 1 }, dt).meter;
  };

  live(140);
  expect(tierAt(bands, hunger.pool.current)?.id).toBe("hungry");
  expect(thirst.pool.current).toBe(0);
  live(30);
  expect(tierAt(bands, hunger.pool.current)?.id).toBe("starving");
  hunger = changeMeter(hunger, 20).meter;
  expect(tierAt(bands, hunger.pool.current)?.id).toBe("hungry");
});
