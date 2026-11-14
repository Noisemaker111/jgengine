import { describe, expect, test } from "bun:test";

import { tuningFrom } from "../parts/build";
import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";
import { TRACKS } from "../tracks/catalog";
import { basketValue, EMPTY_BASKET, grab, loadPart, loadReading, POWER_UP_SLOTS, usePowerUp, type Basket } from "./basket";
import { CHASSIS, chassisById, wobbleSteer } from "./chassis";
import { checkoutReceipt, PLACE_POINTS, readBestReceipts, saveBestReceipt } from "./checkout";
import { GOODS, POWER_UPS, powerUpById, shelfItemById } from "./goods";
import { GRAB_RADIUS, layShelves, nearestShelf, shelfLane } from "./shelves";
import { COMBO_WINDOW, createStyleMeter, type StyleSample } from "./style";

const item = (id: string) => shelfItemById(id)!;
const fill = (ids: readonly string[], capacity = 20): Basket => ids.reduce((basket, id) => {
  const result = grab(basket, item(id), capacity);
  return result.status === "added" ? result.basket : basket;
}, EMPTY_BASKET);

describe("the basket", () => {
  test("a full basket bumps its oldest item out of the back, and the child seat holds two power-ups", () => {
    const full = fill(["chips", "cereal", "watermelon"], 3);
    const overflow = grab(full, item("kettlebell"), 3);
    expect(overflow.status).toBe("added");
    if (overflow.status !== "added") return;
    expect(overflow.dropped?.id).toBe("chips");
    expect(overflow.basket.goods.map((entry) => entry.id)).toEqual(["cereal", "watermelon", "kettlebell"]);
    let seat = EMPTY_BASKET;
    for (const power of POWER_UPS.slice(0, 3)) {
      const result = grab(seat, power, 3);
      if (result.status === "added") seat = result.basket;
    }
    expect(seat.powerUps).toHaveLength(POWER_UP_SLOTS);
    expect(seat.powerUps[0]!.id).toBe(POWER_UPS[1]!.id);
    const used = usePowerUp(seat);
    expect(used.used?.id).toBe(POWER_UPS[1]!.id);
    expect(used.basket.powerUps).toHaveLength(1);
  });

  test("the self-checkout rings up goods and unused power-ups alike", () => {
    const basket = fill(["big_tv", "chips", "extinguisher"]);
    expect(basketValue(basket)).toBe(480 + 4 + 45);
  });

  test("a basket of light snacks is twitchy, a watermelon calms it, and a full shop is loaded", () => {
    expect(loadReading(EMPTY_BASKET).feel).toBe("empty");
    expect(loadReading(fill(["chips", "cereal", "marshmallows", "rubber_duck"])).feel).toBe("twitchy");
    expect(loadReading(fill(["chips", "cereal", "marshmallows", "rubber_duck", "watermelon"])).twitch).toBeLessThan(loadReading(fill(["chips", "cereal", "marshmallows", "rubber_duck"])).twitch);
    expect(loadReading(fill(["kettlebell", "big_tv", "dog_food"])).feel).toBe("loaded");
  });

  test("heavy goods trade launch for momentum and stability; light goods trade grip for turn-in", () => {
    const empty = tuningFrom([]);
    const heavy = tuningFrom([], undefined, { load: loadPart(fill(["kettlebell", "big_tv", "dog_food"])) });
    const light = tuningFrom([], undefined, { load: loadPart(fill(["chips", "cereal", "marshmallows", "rubber_duck", "paper_towels"])) });
    expect(heavy.topSpeed).toBeGreaterThan(empty.topSpeed);
    expect(heavy.accel).toBeLessThan(empty.accel);
    expect(heavy.turnRate).toBeLessThan(empty.turnRate);
    expect(heavy.feel.peakGrip).toBeGreaterThan(empty.feel.peakGrip);
    expect(light.turnRate).toBeGreaterThan(empty.turnRate);
    expect(light.feel.peakGrip).toBeLessThan(empty.feel.peakGrip);
    expect(loadPart(EMPTY_BASKET)).toBeNull();
  });

  test("every shelf item is real store-brand stock with a weight and a price", () => {
    for (const goods of GOODS) {
      expect(goods.weight).toBeGreaterThan(0);
      expect(goods.price).toBeGreaterThan(0);
    }
    expect(POWER_UPS.map((power) => power.id).sort()).toEqual(["bouncy_balls", "extinguisher", "marbles", "mop", "rotisserie_chicken"]);
    expect(powerUpById("rotisserie_chicken")?.blurb).toContain("Heals");
    expect(powerUpById("watermelon")).toBeNull();
  });
});

describe("the carts", () => {
  test("every chassis is a real trade-off against the standard cart", () => {
    const standard = tuningFrom([], undefined, { chassis: chassisById("standard")!.part });
    const kiddie = tuningFrom([], undefined, { chassis: chassisById("kiddie")!.part });
    const flatbed = tuningFrom([], undefined, { chassis: chassisById("flatbed")!.part });
    const scooter = tuningFrom([], undefined, { chassis: chassisById("scooter")!.part });
    expect(standard.topSpeed).toBeCloseTo(tuningFrom([]).topSpeed, 6);
    expect(kiddie.turnRate).toBeGreaterThan(standard.turnRate);
    expect(chassisById("kiddie")!.capacity).toBeLessThan(chassisById("standard")!.capacity);
    expect(flatbed.feel.peakGrip).toBeGreaterThan(standard.feel.peakGrip);
    expect(chassisById("flatbed")!.capacity).toBeGreaterThan(chassisById("standard")!.capacity);
    expect(scooter.topSpeed).toBeGreaterThan(standard.topSpeed);
    expect(chassisById("standard")!.price).toBe(0);
    expect(new Set(CHASSIS.map((entry) => entry.entityKind)).size).toBe(CHASSIS.length);
  });

  test("the squeaky caster flutters the handle at speed, never at a standstill, never once it is fixed", () => {
    expect(wobbleSteer(3.2, 0, 1)).toBe(0);
    expect(wobbleSteer(3.2, 30, 0)).toBe(0);
    let sum = 0;
    let peak = 0;
    for (let t = 0; t < 20; t += 1 / 60) {
      const steer = wobbleSteer(t, 40, 1);
      sum += steer;
      peak = Math.max(peak, Math.abs(steer));
    }
    expect(peak).toBeGreaterThan(0.03);
    expect(peak).toBeLessThan(0.1);
    expect(Math.abs(sum / (20 * 60))).toBeLessThan(0.01);
  });
});

describe("style", () => {
  const sample = (over: Partial<StyleSample> = {}): StyleSample => ({ slip: 0, speedKmh: 30, airborne: false, riding: false, nearEdge: false, crashed: false, ...over });
  const run = (meter: ReturnType<typeof createStyleMeter>, seconds: number, over: Partial<StyleSample>) => {
    const awards = [];
    for (let t = 0; t < seconds; t += 1 / 60) awards.push(...meter.tick(1 / 60, sample(over)));
    return awards;
  };

  test("a held slide scores a drift when it ends, and one hugging the shelf ends is an end-cap drift", () => {
    const meter = createStyleMeter();
    expect(run(meter, 1.2, { slip: 0.5 })).toEqual([]);
    const drift = run(meter, 0.5, {});
    expect(drift).toHaveLength(1);
    expect(drift[0]!.kind).toBe("drift");
    const endcap = createStyleMeter();
    run(endcap, 1, { slip: 0.5, nearEdge: true });
    expect(run(endcap, 0.5, {})[0]!.kind).toBe("endcap");
    const wiggle = createStyleMeter();
    run(wiggle, 0.3, { slip: 0.5 });
    expect(run(wiggle, 0.5, {})).toEqual([]);
  });

  test("air off a pallet ramp scores on landing, riding the back bar scores while you hold it", () => {
    const meter = createStyleMeter();
    run(meter, 0.6, { airborne: true });
    expect(run(meter, 0.1, {}).map((award) => award.kind)).toEqual(["air"]);
    const rider = createStyleMeter();
    expect(run(rider, 3.1, { riding: true }).filter((award) => award.kind === "ride")).toHaveLength(2);
    expect(run(createStyleMeter(), 3.1, { riding: true, speedKmh: 5 })).toEqual([]);
  });

  test("tricks chained inside the combo window multiply, and a crash breaks the chain", () => {
    const meter = createStyleMeter();
    const first = meter.award("swat", 100, "MOP SWAT");
    const second = meter.award("swat", 100, "MOP SWAT");
    const third = meter.award("swat", 100, "MOP SWAT");
    expect([first.points, second.points, third.points]).toEqual([100, 150, 200]);
    run(meter, 0.1, { crashed: true });
    expect(meter.award("swat", 100, "MOP SWAT").points).toBe(100);
    run(meter, COMBO_WINDOW + 0.2, {});
    expect(meter.snapshot().combo).toBe(1);
    expect(meter.snapshot().points).toBe(550);
  });
});

describe("the self-checkout", () => {
  test("the receipt rings up the clock under one and a half par, the cart, the style and the place", () => {
    const receipt = checkoutReceipt({ time: 40, par: 36, cartValue: 120, style: 300, place: 1, items: 5 });
    expect(receipt.lines.map((line) => line.points)).toEqual([Math.round((54 - 40) * 25), 240, 300, PLACE_POINTS[0]!]);
    expect(receipt.total).toBe(350 + 240 + 300 + 500);
    expect(checkoutReceipt({ time: 90, par: 36, cartValue: 0, style: 0, place: 0, items: 0 }).total).toBe(0);
  });

  test("the best receipt per event is kept and only a better one replaces it", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
    expect(saveBestReceipt(storage, "last-call", 900)).toBe(true);
    expect(saveBestReceipt(storage, "last-call", 700)).toBe(false);
    expect(saveBestReceipt(storage, "price-check", 300)).toBe(true);
    expect(readBestReceipts(storage)).toEqual({ "last-call": 900, "price-check": 300 });
    map.set("drift-foundry.receipts.v1", "not json");
    expect(readBestReceipts(storage)).toEqual({});
  });
});

describe("shelf stock", () => {
  test("every department lays its own stock along the shelf edge, clear of its walls, the same every time", () => {
    for (const track of TRACKS) {
      const spots = track.shelves;
      expect(spots.length).toBeGreaterThan(10);
      expect(layShelves(track).map((spot) => [spot.id, spot.item.id])).toEqual(spots.map((spot) => [spot.id, spot.item.id]));
      const stock = new Set([...(track.def.stock?.goods ?? []), ...(track.def.stock?.powerUps ?? [])]);
      for (const spot of spots) {
        expect(stock.has(spot.item.id)).toBe(true);
        expect(Math.abs(spot.lane)).toBeCloseTo(shelfLane(track), 6);
        expect(Math.abs(spot.lane)).toBeLessThan(track.def.halfWidth);
        expect(track.gates.filter((gate) => gate.route === MAIN_ROUTE).every((gate) => Math.abs(gate.atZ - spot.at) >= 9)).toBe(true);
        expect(spot.at).toBeLessThan(track.exitAt);
      }
      expect(spots.some((spot) => spot.item.kind === "power")).toBe(true);
      expect(spots.some((spot) => spot.lane > 0) && spots.some((spot) => spot.lane < 0)).toBe(true);
    }
  });

  test("a grab reaches only the spot the cart is passing, and never one already emptied", () => {
    const spots = TRACKS[0]!.shelves;
    const spot = spots[0]!;
    expect(nearestShelf(spot.position, new Set(), spots)?.id).toBe(spot.id);
    expect(nearestShelf([spot.position[0] + GRAB_RADIUS + 0.5, 0, spot.position[2]], new Set(), spots)).toBeNull();
    expect(nearestShelf(spot.position, new Set([spot.id]), spots)).toBeNull();
  });
});
