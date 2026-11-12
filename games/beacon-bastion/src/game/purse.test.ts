import { beforeEach, describe, expect, test } from "bun:test";
import type { HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";
import { upgradeStepAction } from "@jgengine/core/worldModel/upgradePaths";

import { TOWER_CATALOG } from "./entities/towers/catalog";
import { keep, keepBooks, MEND_RULE, sellAction } from "./keep";
import { PURSE_CURRENCY } from "./purse";
import { advanceKeep, beaconRunner } from "./testing";

const archer = TOWER_CATALOG.tower_archer!;
const cannon = TOWER_CATALOG.tower_cannon!;

let runner: HeadlessRunner;
const world = () => keep.of(runner.ctx);
const books = () => keepBooks(runner.ctx);
const run = (name: string, input: unknown) => runner.ui.tryInvoke(name, input);
const gold = () => world().num("keep.gold");
const reasons = () => books().entries().map((entry) => [entry.reason, entry.amount]);

beforeEach(() => {
  runner = beaconRunner("Beacon books");
});

describe("the keep's purse moves only through its books", () => {
  test("a fresh keep opens its books with the opening purse", () => {
    expect(reasons()).toEqual([["opening-purse", gold()]]);
    expect(books().unexplained()).toEqual({ [PURSE_CURRENCY]: 0 });
  });

  test("builds, a cancelled build, bounty, an upgrade, a mend, a sale and held pay each post their reason", () => {
    const opening = gold();
    run("beacon.place", { kind: "tower_cannon", slot: "plot-2" });
    run("beacon.remove", { id: "tower_cannon-1" });
    run("beacon.place", { kind: "tower_archer", slot: "plot-1" });
    advanceKeep(runner, 0.25);
    keep.emit(runner.ctx, { kind: "bounty", scale: 40 });
    run("beacon.act", { action: upgradeStepAction("tower_archer", null, 1), target: "tower_archer-2" });
    keep.emit(runner.ctx, { kind: "leak", scale: 1 });
    run("beacon.act", { action: "mend" });
    run("beacon.act", { action: sellAction("tower_archer"), target: "tower_archer-2" });
    keep.emit(runner.ctx, { kind: "held_pay", scale: 22 });
    keep.emit(runner.ctx, { kind: "overlap_bonus", scale: 5 });

    expect(reasons()).toEqual([
      ["opening-purse", opening],
      ["tower-build", -cannon.cost],
      ["build-cancelled", cannon.cost],
      ["tower-build", -archer.cost],
      ["kill-bounty", 40],
      ["tower-upgrade", -38],
      ["wall-mend", -MEND_RULE.gold],
      ["tower-sale", Math.round((archer.cost + 38) * 0.7)],
      ["held-pay", 22],
      ["early-call-bonus", 5],
    ]);
    // The history alone explains the purse: every entry sums to it and the books are square.
    expect(books().entries().reduce((sum, entry) => sum + entry.amount, 0)).toBe(gold());
    expect(books().unexplained()).toEqual({ [PURSE_CURRENCY]: 0 });
    expect(books().entries().find((entry) => entry.reason === "tower-sale")?.ref).toBe("tower_archer-2");
  });

  test("a load reopens the books at the purse it brought, and a saved journal squares to it", () => {
    run("beacon.place", { kind: "tower_archer", slot: "plot-1" });
    const saved = world().snapshot();
    const journal = books().snapshot();
    keep.emit(runner.ctx, { kind: "bounty", scale: 12 });

    world().restore(saved);
    books().reset("load");
    expect(reasons()).toEqual([["load", gold()]]);

    expect(books().restore(journal, "load")).toBe(true);
    expect(books().entries().map((entry) => entry.reason)).toEqual(["opening-purse", "tower-build"]);
    expect(books().unexplained()).toEqual({ [PURSE_CURRENCY]: 0 });
  });
});
