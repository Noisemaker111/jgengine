import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { DAY_LENGTH } from "./catalog";
import { BUILDABLES } from "./objects/catalog";
import { CAMPAIGNS, MONTH_DAYS } from "./books";
import { cellFor, LOAN, marketingBoost, park, parkMetrics, reliability, repairAction } from "./park";
import { demand } from "./sim/rating";
import { forceBreakdown } from "./capture";
import { connectPark } from "./build/links";
import { rideView } from "./rides";
import { closeDay } from "./sim/economy";
import { ratingTarget } from "./sim/rating";
import { GATE_PLAZA, resetPark } from "./parkReset";

/** Park days are fast-forwarded a second per step, not at the 60 Hz the game plays at. */
function parkRunner() {
  const runner = createHeadlessRunner({ game, maxStepSeconds: 1 });
  runner.ctx.sim.retune({ hz: "variable" });
  return runner;
}

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

/** A started park on the composed loop (the world system installed): the authored starter park, its gates open mid-morning. */
function openPark() {
  const runner = parkRunner();
  resetPark(runner.ctx, { layout: "starter", guests: 0 });
  runner.ui.invoke("park.start");
  runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
  return { runner, w: park.of(runner.ctx) };
}

describe("a new park", () => {
  test("a scenario started mid-way through another park starts its calendar again: 09:00, day one, one midnight a day", () => {
    const { runner, w } = openPark();
    for (let day = 0; day < 4; day += 1) closeDay(runner.ctx);
    runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 4 + DAY_LENGTH * 0.6 });
    expect(w.num("park.day")).toBe(5);
    expect(runner.ctx.game.commands.run("park.scenario", { id: "brightway_beginnings" }).status).toBe("applied");
    expect(runner.ctx.time.now()).toBeCloseTo(DAY_LENGTH * (9 / 24));
    expect(w.num("park.day")).toBe(1);
    step(runner, DAY_LENGTH);
    expect(w.num("park.day")).toBe(2);
    step(runner, DAY_LENGTH);
    expect(w.num("park.day")).toBe(3);
  }, 30_000);

  test("is an empty lot with a shut gate: no guests until a connected ride runs and the player opens it", () => {
    const runner = parkRunner();
    runner.ui.invoke("park.start");
    runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
    const w = park.of(runner.ctx);
    expect(w.instances().map((entry) => entry.kind)).toEqual(GATE_PLAZA.map(() => "path_walk"));
    expect(w.fact("park.gate")).toBe(false);
    expect(w.num("park.loan_owed")).toBe(LOAN.start);
    step(runner, 30);
    expect(w.num("park.guests_today")).toBe(0);
    expect(w.fact("park.open")).toBe(false);
    // No ride: the gate refuses to open.
    expect(runner.ctx.game.commands.run("brightway.act", { action: "open_gate" }).status).toBe("rejected");

    // A path north from the plaza, a carousel beside it, its entrance and exit: the gate opens.
    runner.ui.invoke("build.line", { kind: "path_walk", from: [0, 48], to: [0, 32] });
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "ride_carousel", cell: cellFor("ride_carousel", 10, 38) }).status).toBe("applied");
    const ride = w.instances("ride_carousel")[0]?.id ?? "";
    runner.ui.invoke("build.connect", { id: ride });
    expect(w.fact(`${ride}.closed`)).toBe(false);
    expect(runner.ctx.game.commands.run("brightway.act", { action: "open_gate" }).status).toBe("applied");

    // Guests trickle in: a handful in the first minute, not a flood.
    step(runner, 60);
    expect(w.num("park.guests_today")).toBeGreaterThan(0);
    expect(w.num("park.guests_today")).toBeLessThan(12);
    // The rating moves over the day, not in seconds.
    expect(w.num("park.rating")).toBeLessThan(60);
  }, 30_000);
});

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

    // Breakdown: the ripple sours the crowd, the ride's appeal leaves the totals, the mechanic is sent and paid.
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", 40, 40) }).status).toBe("applied");
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

  test("a broken ride stays down until the park hires a mechanic, who goes straight to it", () => {
    const { runner, w } = openPark();
    const ride = w.instances("ride_carousel")[0]?.id ?? "";
    const repairSeconds = BUILDABLES.ride_carousel?.ride?.breakdown.repairSeconds ?? 0;
    forceBreakdown(runner.ctx, ride);
    expect(w.orders("crew")).toHaveLength(0);
    expect(w.canAct(repairAction("ride_carousel"), ride)?.message).toContain("mechanic");
    expect(runner.ctx.game.notices.list().some((notice) => notice.text.includes("hire a mechanic"))).toBe(true);
    step(runner, repairSeconds + 5);
    expect(w.fact(`${ride}.broken`)).toBe(true);

    // The mechanic needs no research: hired from the start, and the first job is the broken ride.
    expect(runner.ctx.game.commands.run("brightway.place", { kind: "staff_mechanic", cell: cellFor("staff_mechanic", 40, 40) }).status).toBe("applied");
    step(runner, 1);
    const order = w.orders("crew").find((entry) => entry.target === ride);
    expect(order?.label ?? "").toContain("Repair");
    step(runner, repairSeconds + 1);
    expect(w.fact(`${ride}.broken`)).toBe(false);
  }, 30_000);

  test("reliability falls with every run since service; bins catch litter", () => {
    const carousel = BUILDABLES.ride_carousel;
    if (carousel === undefined) throw new Error("no carousel");
    expect(reliability(carousel, 0)).toBeGreaterThan(reliability(carousel, 20));
    expect(reliability(carousel, 0)).toBeLessThan(100);
    // The empty lot: no guests dropping litter and no handyman sweeping it, so only the bins move it.
    const runner = parkRunner();
    resetPark(runner.ctx);
    runner.ui.invoke("park.start");
    runner.ctx.time.hydrate({ ...runner.ctx.time.snapshot(), now: DAY_LENGTH * 0.3, paused: false });
    const w = park.of(runner.ctx);
    w.set("park.litter", 50);
    step(runner, 10);
    expect(w.num("park.litter")).toBe(50);
    for (let i = 0; i < 4; i += 1) runner.ctx.game.commands.run("brightway.place", { kind: "deco_bin", cell: [2 + i, 2] });
    expect(w.num("n.deco_bin")).toBe(4);
    step(runner, 10);
    expect(w.num("park.litter")).toBeLessThan(50 - 0.1);
  }, 30_000);

  test("the park opens in debt; borrowing is an action; midnight restocks the stalls; the month's close charges interest and files the books", () => {
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
    expect(w.num("month.loan")).toBe(owed - LOAN.start);

    const stall = w.instances("stall_food")[0]?.id ?? "";
    w.change({ [`${stall}.sold`]: 10 });
    const restock = (BUILDABLES.stall_food?.stall?.restock ?? 0) * 10;
    const tillBefore = w.num("park.cash");
    closeDay(runner.ctx);
    expect(w.num(`${stall}.sold`)).toBe(0);
    // No interest at midnight: the bank charges when the month closes.
    expect(w.num("park.cash")).toBe(tillBefore - restock);
    expect(w.num("park.upkeep_yesterday")).toBeGreaterThanOrEqual(restock);
    expect(w.num("park.day")).toBe(2);
    expect(w.num("month.restock")).toBe(restock);

    // Paying early is the same instalment, from the till, on demand.
    expect(runner.ctx.game.commands.run("brightway.act", { action: "repay_loan" }).status).toBe("applied");
    expect(w.num("park.loan_owed")).toBe(owed - LOAN.step);
    expect(w.num("month.loan")).toBe(owed - LOAN.start - LOAN.step);

    const interest = Math.round((owed - LOAN.step) * LOAN.monthlyRate);
    const beforeClose = w.num("park.cash");
    while (w.num("park.day") <= MONTH_DAYS) closeDay(runner.ctx);
    expect(w.num("park.cash")).toBe(beforeClose - interest);
    expect(w.num("report.month")).toBe(0);
    expect(w.num("report.interest")).toBe(interest);
    expect(w.num("report.restock")).toBe(restock);
    expect(w.num("report.loan")).toBe(owed - LOAN.start - LOAN.step);
    // The new month starts its lines at zero, from the till as it stands.
    expect(w.num("month.interest")).toBe(0);
    expect(w.num("month.cash_start")).toBe(w.num("park.cash"));
    expect(w.num("report.profit")).toBe(w.num("park.cash") - cash);
  });

  test("a marketing campaign is paid up front, brings more guests while it runs, and one of each runs at a time", () => {
    const { runner, w } = openPark();
    const campaign = CAMPAIGNS[0];
    if (campaign === undefined) throw new Error("no campaigns");
    expect(marketingBoost(w)).toBe(1);
    const cash = w.num("park.cash");
    expect(runner.ctx.game.commands.run("brightway.act", { action: campaign.id }).status).toBe("applied");
    expect(w.num("park.cash")).toBe(cash - campaign.cost);
    expect(w.num("month.marketing")).toBe(campaign.cost);
    expect(marketingBoost(w)).toBe(1 + campaign.boost);
    expect(demand(20, 8, 100, true, marketingBoost(w))).toBeGreaterThan(demand(20, 8, 100, true));
    expect(runner.ctx.game.commands.run("brightway.act", { action: campaign.id }).status).toBe("rejected");
    runner.step(campaign.days * DAY_LENGTH + 2);
    expect(marketingBoost(w)).toBe(1);
  }, 30_000);

  test("ride and entry prices are world facts the actions move inside their bounds", () => {
    const { runner, w } = openPark();
    const price = w.num("price.ride_carousel");
    runner.ui.invoke("brightway.act", { action: "price_up_ride_carousel" });
    expect(w.num("price.ride_carousel")).toBe(price + 1);
    for (let i = 0; i < 80; i += 1) runner.ui.invoke("brightway.act", { action: "ticket_down" });
    expect(w.num("park.ticket")).toBe(0);
  });
});
