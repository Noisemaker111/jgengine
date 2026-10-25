import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { content } from "./content";
import { DAY_LENGTH } from "./catalog";
import { BUILDABLES } from "./objects/catalog";
import { cellFor, LOAN, park, parkMetrics, QUICK_REPAIR } from "./park";
import { forceBreakdown } from "./capture";
import { connectPark } from "./build/links";
import { rideView } from "./rides";
import { closeDay } from "./sim/economy";
import { ratingTarget } from "./sim/rating";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
});
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

/** A started park on the composed loop (the world system installed), its gates open mid-morning. */
function openPark() {
  const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
  return { runner, w: park.of(runner.ctx) };
}

const step = (runner: ReturnType<typeof openPark>["runner"], seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) runner.step(0.25);
};

describe("Brightway Park as one declaration", () => {
  test("build → income → breakdown → queued repair → rating", () => {
    const { runner, w } = openPark();
    const carousel = BUILDABLES.ride_carousel!;

    // Build: the world takes the cost and stands the ride on the lot.
    const before = w.num("park.cash");
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", -40, -40) }).status).toBe("applied");
    expect(w.num("park.cash")).toBe(before - carousel.cost);
    expect(w.num("n.ride_carousel")).toBe(2);
    const ride = w.instances("ride_carousel").at(-1)!.id;
    // A ride opens once an entrance and an exit join it to the paths (laid free here).
    connectPark(runner.ctx, { only: ride, free: true });
    expect(w.fact(`${ride}.closed`)).toBe(false);

    // Income: guests come through the gate and pay; the day's takings are a world fact.
    step(runner, 40);
    expect(w.num("park.guests_today")).toBeGreaterThan(0);
    expect(w.num("park.revenue_today")).toBeGreaterThan(0);
    expect(w.num("park.mood")).toBeGreaterThan(0);

    // Breakdown: the ripple sours the crowd, the ride's appeal leaves the totals, the crew is sent and paid.
    const up = parkMetrics(w);
    const target = ratingTarget(up, w.num("park.mood"), w.num("park.guests_today"), w.num("park.litter"));
    const cash = w.num("park.cash");
    const buzz = w.num("park.buzz");
    expect(forceBreakdown(runner.ctx, ride)).toBe(true);
    expect(w.fact(`${ride}.broken`)).toBe(true);
    expect(w.num("park.breakdowns")).toBe(1);
    expect(w.num("park.buzz")).toBe(buzz - 15);
    expect(rideView(ride)?.phase).toBe("broken");
    const down = parkMetrics(w);
    expect(down.ridesOpen).toBe(up.ridesOpen - 1);
    expect(down.totalAppeal).toBeCloseTo(up.totalAppeal - carousel.appeal);
    expect(ratingTarget(down, w.num("park.mood"), w.num("park.guests_today"), w.num("park.litter"))).toBeLessThan(target);
    const order = w.orders("crew").find((entry) => entry.target === ride);
    expect(order).toBeDefined();
    expect(w.num("park.cash")).toBe(cash - carousel.ride!.breakdown.repairCost);
    // A second repair for the same ride is not taken while the crew is on it.
    expect(w.orders("crew").filter((entry) => entry.target === ride)).toHaveLength(1);

    // The crowd feels it: every guest's mood carries the buzz.
    const moodUp = w.num("park.mood");
    step(runner, 1);
    expect(w.num("park.mood")).toBeLessThan(moodUp);

    // Repair: the queued order lands after its time, the ride comes back up and the crowd cheers a little.
    step(runner, carousel.ride!.breakdown.repairSeconds + 1);
    expect(w.orders("crew").find((entry) => entry.target === ride)).toBeUndefined();
    expect(w.fact(`${ride}.broken`)).toBe(false);
    expect(rideView(ride)?.phase).not.toBe("broken");
    expect(parkMetrics(w).ridesOpen).toBe(up.ridesOpen);
    expect(runner.ctx.game.notices.list().some((notice) => notice.text.includes("running again"))).toBe(true);

    // Rating: it eases toward a target that has the ride's appeal back in it, and the peak keeps the best.
    const rating = w.num("park.rating");
    step(runner, 4);
    expect(w.num("park.rating")).not.toBe(rating);
    expect(w.num("park.peak")).toBeGreaterThanOrEqual(w.num("park.rating"));
  }, 30_000);

  test("a mechanic bay sends the quicker crew order", () => {
    const { runner, w } = openPark();
    // The bay is a lab topic: locked until its research lands.
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", 40, 40) }).status).toBe("rejected");
    w.set("research.staff_mechanic", true);
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", 40, 40) }).status).toBe("applied");
    const ride = w.instances("ride_carousel")[0]!.id;
    forceBreakdown(runner.ctx, ride);
    const order = w.orders("crew").find((entry) => entry.target === ride)!;
    expect(order.label).toContain("Repair");
    expect(order.remaining).toBeCloseTo(Math.round(BUILDABLES.ride_carousel!.ride!.breakdown.repairSeconds * QUICK_REPAIR), 0);
  });

  test("the park opens in debt; borrowing is an action, interest is a nightly ripple; midnight restocks the stalls", () => {
    const { runner, w } = openPark();
    expect(w.num("park.loan_owed")).toBe(LOAN.start);
    const cash = w.num("park.cash");
    expect(runner.ctx.game.commands.run("brightway.act", { action: "take_loan" }).status).toBe("applied");
    expect(w.num("park.cash")).toBe(cash + LOAN.step);
    expect(w.num("park.loan_owed")).toBe(LOAN.start + LOAN.step);
    // The bank stops at its ceiling.
    while (w.num("park.loan_owed") < LOAN.max) runner.ctx.game.commands.run("brightway.act", { action: "take_loan" });
    expect(runner.ctx.game.commands.run("brightway.act", { action: "take_loan" }).status).toBe("rejected");
    const owed = w.num("park.loan_owed");
    const interest = Math.round(owed * LOAN.dailyRate);

    const stall = w.instances("stall_food")[0]!.id;
    w.change({ [`${stall}.sold`]: 10 });
    const restock = BUILDABLES.stall_food!.stall!.restock * 10;
    const tillBefore = w.num("park.cash");
    closeDay(runner.ctx);
    expect(w.num(`${stall}.sold`)).toBe(0);
    expect(w.num("park.loan_owed")).toBe(owed);
    expect(w.num("park.cash")).toBe(tillBefore - restock - interest);
    expect(w.num("park.upkeep_yesterday")).toBeGreaterThanOrEqual(restock + interest);
    expect(w.num("park.day")).toBe(2);

    // Paying early is the same instalment, from the till, on demand.
    expect(runner.ctx.game.commands.run("brightway.act", { action: "repay_loan" }).status).toBe("applied");
    expect(w.num("park.loan_owed")).toBe(owed - LOAN.step);
  });

  test("ride and entry prices are world facts the actions move inside their bounds", () => {
    const { runner, w } = openPark();
    const price = w.num("price.ride_carousel");
    runner.ui.invoke("brightway.act", { action: "price_up_ride_carousel" });
    expect(w.num("price.ride_carousel")).toBe(price + 1);
    for (let i = 0; i < 80; i += 1) runner.ui.invoke("brightway.act", { action: "ticket_down" });
    expect(w.num("park.ticket")).toBe(0);
  });
});
