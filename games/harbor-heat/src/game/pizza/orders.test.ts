import { describe, expect, test } from "bun:test";
import { CUSTOMERS, LIGHTHOUSE_KEEPER, PIZZAS } from "./menu";
import { ageOrder, coldLimitOf, hottest, nextCaller, parSeconds, repStars, rollMod, settleOrder, type Order } from "./orders";
import {
  buyUpgrade,
  closeShift,
  freshPizzeria,
  kitchenOf,
  nextTier,
  nightlyQuota,
  ovenCapacity,
  payDebt,
  STARTING_DEBT,
} from "./pizzeria";

const kitchen = kitchenOf(freshPizzeria());
const fresh = (overrides: Partial<Order> = {}): Order => ({ id: "o1", customerId: "gus", pizzaId: "margherita", heat: 95, soak: 0, age: 0, par: 60, ...overrides });

describe("pizza orders", () => {
  test("every customer orders pizzas on the menu", () => {
    const menu = new Set(PIZZAS.map((pizza) => pizza.id));
    for (const customer of CUSTOMERS) for (const pizza of customer.pizzas) expect(menu.has(pizza)).toBe(true);
    expect(new Set(CUSTOMERS.map((customer) => customer.marker)).size).toBe(CUSTOMERS.length);
  });

  test("a box cools on the road, faster up in the blimp, and soaks in the spray", () => {
    const road = ageOrder(fresh(), 10, { kitchen, soakPerSecond: 0, altitude: false });
    expect(road.heat).toBeCloseTo(95 - 5.5, 5);
    expect(road.age).toBe(10);
    const air = ageOrder(fresh(), 10, { kitchen, soakPerSecond: 0, altitude: true });
    expect(air.heat).toBeLessThan(road.heat);
    const wet = ageOrder(fresh(), 10, { kitchen, soakPerSecond: 4, altitude: false });
    expect(wet.soak).toBe(40);
    const bag = kitchenOf(buyUpgrade(buyUpgrade(freshPizzeria(), "bag"), "bag"));
    expect(ageOrder(fresh(), 10, { kitchen: bag, soakPerSecond: 0, altitude: false }).heat).toBeGreaterThan(road.heat);
  });

  test("tips scale with heat, dryness and speed; the price is always paid", () => {
    const perfect = settleOrder(fresh({ age: 30 }), { kitchen, floor: "door", stack: 1 });
    const cold = settleOrder(fresh({ heat: 10, age: 30 }), { kitchen, floor: "door", stack: 1 });
    const soggy = settleOrder(fresh({ soak: 70, age: 30 }), { kitchen, floor: "door", stack: 1 });
    const late = settleOrder(fresh({ age: 140 }), { kitchen, floor: "door", stack: 1 });
    expect(perfect.verdict).toBe("great");
    expect(cold.tip).toBe(0);
    expect(cold.price).toBe(21);
    expect(cold.verdict).toBe("bad");
    expect(soggy.tip).toBeLessThan(perfect.tip);
    expect(late.tip).toBeLessThan(perfect.tip);
    expect(perfect.total).toBe(perfect.lines.reduce((sum, line) => sum + line.amount, 0));
  });

  test("a stacked run and a rooftop drop pay extra; better toppings raise every tip", () => {
    const single = settleOrder(fresh({ age: 20 }), { kitchen, floor: "door", stack: 1 });
    const stacked = settleOrder(fresh({ age: 20 }), { kitchen, floor: "rooftop", stack: 3 });
    expect(stacked.tip).toBeGreaterThan(single.tip);
    expect(stacked.lines.map((line) => line.label)).toEqual(expect.arrayContaining(["Rooftop basket", "Stack of 3"]));
    const fancy = kitchenOf(buyUpgrade(freshPizzeria(), "toppings"));
    expect(settleOrder(fresh({ age: 20 }), { kitchen: fancy, floor: "door", stack: 1 }).tip).toBeGreaterThan(single.tip);
  });

  test("a rival grabs the hottest box", () => {
    expect(hottest([fresh({ id: "a", heat: 40 }), fresh({ id: "b", heat: 80 })])?.id).toBe("b");
    expect(hottest([])).toBeUndefined();
  });

  test("the lighthouse keeper always calls first when she is free; reputation gates the rest", () => {
    const ida = nextCaller({ rep: 1, hour: 19, busy: new Set(), roll: 0.5, idaDue: true });
    expect(ida?.id).toBe(LIGHTHOUSE_KEEPER);
    const starter = new Set<string>();
    for (let roll = 0; roll < 1; roll += 0.05) {
      const caller = nextCaller({ rep: 0, hour: 18.2, busy: new Set(), roll, idaDue: false });
      if (caller !== null) starter.add(caller.id);
    }
    expect([...starter].sort()).toEqual(["gus", "okafor_twins"]);
    expect(nextCaller({ rep: 0, hour: 18, busy: new Set(["gus", "okafor_twins"]), roll: 0, idaDue: false })).toBeNull();
    expect(repStars(0)).toBe(0);
    expect(repStars(10)).toBe(2);
    expect(repStars(100)).toBe(5);
    expect(parSeconds(170)).toBe(45);
  });
});

describe("a caller's extra request", () => {
  test("requests pay only when met, and change the rules of the one box", () => {
    const rush = settleOrder(fresh({ age: 20, mod: "rush" }), { kitchen, floor: "door", stack: 1 });
    const plain = settleOrder(fresh({ age: 20 }), { kitchen, floor: "door", stack: 1 });
    expect(rush.lines.map((line) => line.label)).toContain("Rush");
    expect(rush.tip).toBeGreaterThan(plain.tip);
    expect(settleOrder(fresh({ age: 90, mod: "rush" }), { kitchen, floor: "door", stack: 1 }).lines.map((line) => line.label)).not.toContain("Rush");
    // Extra hot raises the cold limit: 40 degrees is fine for Gus, too cold for an extra-hot order.
    expect(coldLimitOf(fresh({ mod: "extra_hot" }))).toBe(40);
    expect(settleOrder(fresh({ heat: 35, age: 20, mod: "extra_hot" }), { kitchen, floor: "door", stack: 1 }).tip).toBe(0);
    // Keep it dry soaks twice as fast.
    const dry = ageOrder(fresh({ mod: "keep_dry" }), 10, { kitchen, soakPerSecond: 2, altitude: false });
    expect(dry.soak).toBe(40);
  });

  test("nobody asks for extras from a shop with no reputation; more do as it grows", () => {
    expect(rollMod(0.01, 0)).toBeUndefined();
    expect(rollMod(0.01, 2)).toBe("rush");
    expect(rollMod(0.9, 5)).toBeUndefined();
  });
});

describe("the family pizzeria", () => {
  test("ovens add capacity, each track tops out", () => {
    let shop = freshPizzeria();
    expect(ovenCapacity(shop)).toBe(1);
    shop = buyUpgrade(shop, "oven");
    expect(ovenCapacity(shop)).toBe(2);
    shop = buyUpgrade(buyUpgrade(shop, "oven"), "oven");
    expect(ovenCapacity(shop)).toBe(4);
    expect(nextTier(shop, "oven")).toBeNull();
    expect(buyUpgrade(shop, "oven")).toBe(shop);
  });

  test("missing quota lets MegaSlice lean in until it calls the note; paying it off saves the shop", () => {
    let shop = freshPizzeria();
    expect(nightlyQuota(shop)).toBe(140);
    const good = closeShift(shop, 500);
    expect(good.metQuota).toBe(true);
    expect(good.state.pressure).toBeLessThan(shop.pressure);
    let foreclosed = false;
    for (let night = 0; night < 6 && !foreclosed; night += 1) {
      const close = closeShift(shop, 0);
      shop = close.state;
      foreclosed = close.foreclosed;
    }
    expect(foreclosed).toBe(true);
    expect(shop.debt).toBeGreaterThan(STARTING_DEBT);
    shop = payDebt(shop, 1_000_000);
    expect(shop.debt).toBe(0);
    expect(shop.saved).toBe(true);
    expect(closeShift(shop, 0).foreclosed).toBe(false);
  });
});
