import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../../game.config";
import { MONTH_DAYS } from "../books";
import { DAY_LENGTH } from "../catalog";
import { stagePark } from "../capture";
import { park } from "../park";
import { closeDay } from "./economy";
import { guestPopulation } from "./guests";
import { applySave, decodeSave, snapshotPark } from "../persistence";
import { resetPark } from "../parkReset";
import { session } from "../session";

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

/** FNV-1a over the per-step lines, so a long run compares as one number. */
function hash(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const FACTS = [
  "park.cash", "park.loan_owed", "park.interest_paid", "park.guests", "park.guests_today", "park.scenario_visitors",
  "park.red_months", "park.day", "report.interest", "report.loan", "month.loan", "month.gate",
] as const;

/**
 * A fixed-seed park run past a month's close, digested per step: the crowd (every guest's id and
 * phase), the gate's counts, and the bank's books. The expected digest was recorded from the park's
 * hand-rolled crowd counter and loan before they moved onto the shared population and loan book, so
 * a change here is a change in what the park does.
 */
describe("park run trace", () => {
  test("a fixed-seed park, a loan drawn and part repaid, runs as it did before", () => {
    const runner = createHeadlessRunner({ game, maxStepSeconds: 1, seed: "brightway-trace" });
    runner.ui.invoke("park.start");
    stagePark(runner.ctx, "full");
    const w = park.of(runner.ctx);
    const population = guestPopulation(runner.ctx);
    runner.ui.invoke("brightway.act", { action: "take_loan" });
    runner.ui.invoke("brightway.act", { action: "take_loan" });
    runner.ui.invoke("brightway.act", { action: "repay_loan" });

    let digest = 2166136261;
    let peak = 0;
    const run = (seconds: number): void => {
      const end = runner.ctx.time.now() + seconds;
      while (runner.ctx.time.now() < end) {
        runner.step(1);
        let line = FACTS.map((key) => w.num(key).toFixed(4)).join(",");
        for (const guest of session.guests.values()) line += `|${guest.id}:${guest.phase}`;
        digest = hash(line, digest);
        peak = Math.max(peak, session.guests.size);
        // The world's counts are the population's: the guests whose bodies the park made.
        expect(population.onSite()).toBe(session.guests.size);
        expect(w.num("park.guests")).toBe(population.onSite());
        expect(w.num("park.guests_today")).toBe(population.arrivalsToday());
      }
    };
    // A day and a half of gate traffic, across a midnight.
    run(DAY_LENGTH * 1.5);
    // The rest of the month closed at once, so the bank's interest lands, then the next morning's crowd.
    while (w.num("park.day") <= MONTH_DAYS) closeDay(runner.ctx);
    run(DAY_LENGTH * 0.5);
    const summary = Object.fromEntries(FACTS.map((key) => [key, Math.round(w.num(key) * 100) / 100]));
    expect(summary).toEqual({
      "park.cash": 10906.47, "park.loan_owed": 11000, "park.interest_paid": 440, "park.guests": 10,
      "park.guests_today": 6, "park.scenario_visitors": 39, "park.red_months": 0, "park.day": 9,
      "report.interest": 440, "report.loan": 1000, "month.loan": 0, "month.gate": 48,
    });
    expect(peak).toBe(53);
    expect(session.guests.size).toBe(10);
    expect(digest).toBe(407696641);
  }, 300_000);

  test("a saved crowd comes back on the population and the gate carries on where it left off", () => {
    const runner = createHeadlessRunner({ game, maxStepSeconds: 1, seed: "brightway-crowd-save" });
    runner.ui.invoke("park.start");
    stagePark(runner.ctx, "full");
    const crowdLine = (): string => [...session.guests.values()].map((guest) => `${guest.id}:${guest.phase}`).join("|");
    for (let t = 0; t < 40; t += 1) runner.step(1);
    const saved = JSON.stringify(snapshotPark(runner.ctx));
    const before = guestPopulation(runner.ctx).snapshot();
    const live: string[] = [];
    for (let t = 0; t < 40; t += 1) {
      runner.step(1);
      live.push(crowdLine());
    }

    const reloaded = createHeadlessRunner({ game, maxStepSeconds: 1, seed: "brightway-crowd-save" });
    resetPark(reloaded.ctx, { layout: "blank" });
    applySave(reloaded.ctx, decodeSave(saved)!);
    session.started = true;
    reloaded.ctx.time.play();
    const population = guestPopulation(reloaded.ctx);
    const after = population.snapshot();
    expect(after.visitors.map((visitor) => visitor.id)).toEqual(before.visitors.map((visitor) => visitor.id));
    expect(after.sequence).toBe(before.sequence);
    expect(after.pending).toBe(before.pending);
    expect(population.arrivalsToday()).toBe(park.of(reloaded.ctx).num("park.guests_today"));
    const replay: string[] = [];
    for (let t = 0; t < 40; t += 1) {
      reloaded.step(1);
      replay.push(crowdLine());
    }
    expect(replay).toEqual(live);
  }, 120_000);
});
