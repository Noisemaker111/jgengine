import { describe, expect, test } from "bun:test";
import { CUSTOMERS, pizzaById } from "./menu";
import { freshPizzeria, nightlyQuota, QUOTA_CEILING_BASE, QUOTA_START, QUOTA_STEP } from "./pizzeria";
import { CATERING_EVENTS, cateringDrop, cateringTonight, loyaltyStep, loyaltyTier, orderFor, SECRET_PIZZAS, WEEKEND, weekendRush } from "./regulars";

describe("regulars", () => {
  test("three good drops make a regular, seven a favourite, and each step is announced once", () => {
    expect(loyaltyTier(2)).toBeNull();
    expect(loyaltyTier(3)?.id).toBe("regular");
    expect(loyaltyTier(7)?.id).toBe("favourite");
    expect(loyaltyStep(2, 3)?.id).toBe("regular");
    expect(loyaltyStep(3, 4)).toBeNull();
    expect(loyaltyStep(6, 8)?.id).toBe("favourite");
  });

  test("every customer has a secret pie, dearer than anything on the board, ordered only as a favourite", () => {
    const priciest = Math.max(...CUSTOMERS.flatMap((customer) => customer.pizzas.map((id) => pizzaById(id)?.price ?? 0)));
    for (const customer of CUSTOMERS) {
      const secret = SECRET_PIZZAS[customer.id];
      expect(secret).toBeDefined();
      expect(secret!.price).toBeGreaterThan(priciest);
      expect(pizzaById(secret!.id)).toEqual(secret);
      expect(orderFor(customer.id, customer.pizzas, 6)).toEqual(customer.pizzas);
      expect(orderFor(customer.id, customer.pizzas, 7)[0]).toBe(secret!.id);
      expect(orderFor(customer.id, customer.pizzas, 7).length).toBe(customer.pizzas.length);
    }
  });
});

describe("the weekend rush", () => {
  test("nights six and seven of each week, with a higher quota", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12, 13].map(weekendRush)).toEqual([false, false, false, false, false, true, true, false, true, true]);
    const friday = { ...freshPizzeria(), shifts: 4 };
    const saturday = { ...freshPizzeria(), shifts: 5 };
    const plain = Math.min(QUOTA_CEILING_BASE, QUOTA_START + 5 * QUOTA_STEP);
    expect(nightlyQuota(saturday)).toBe(Math.round(plain * WEEKEND.quotaScale));
    expect(nightlyQuota(friday)).toBeLessThan(nightlyQuota(saturday));
  });
});

describe("catering events", () => {
  test("weekend nights and every fourth night book one, at real doors with a real pie", () => {
    const customers = new Set(CUSTOMERS.map((customer) => customer.id));
    for (const event of CATERING_EVENTS) {
      expect(event.drops.every((id) => customers.has(id))).toBe(true);
      expect(new Set(event.drops).size).toBe(event.drops.length);
      expect(pizzaById(event.pizza)).toBeDefined();
    }
    expect(cateringTonight(0)).toBeNull();
    expect(cateringTonight(2)).not.toBeNull();
    expect(cateringTonight(5)).not.toBeNull();
  });

  test("the bonus pays on the last door only inside the window", () => {
    const event = CATERING_EVENTS[0]!;
    let run = { id: event.id, remaining: [...event.drops], startedAt: 100, done: false };
    for (const [index, door] of event.drops.entries()) {
      const step = cateringDrop(event, run, door, 100 + 60 * (index + 1));
      run = step.run;
      expect(step.bonus).toBe(index === event.drops.length - 1 ? event.bonus : 0);
    }
    expect(run.done).toBe(true);
    const late = cateringDrop(event, { id: event.id, remaining: [event.drops[0]!], startedAt: 0, done: false }, event.drops[0]!, event.window + 1);
    expect(late.bonus).toBe(0);
    expect(late.run.done).toBe(true);
  });
});
