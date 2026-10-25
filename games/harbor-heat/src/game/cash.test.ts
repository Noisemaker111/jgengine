import { describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { game } from "../game.config";
import { loop } from "../loop";
import { content } from "./content";
import {
  cashEntries,
  earn,
  ledgerEntryCount,
  ledgerState,
  openBooks,
  recordWalletChange,
  restoreLedger,
  spend,
} from "./cash";

const HERO = "cash-hero";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: HERO, isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}

function wallet(ctx: GameContext): number {
  return ctx.game.economy.balance(ctx.player.userId, "cash");
}

describe("harbor-heat cash ledger", () => {
  test("every movement posts with the reason it happened and the balance it produced", () => {
    const ctx = boot();
    openBooks(ctx);
    const start = wallet(ctx);
    const startEntries = ledgerEntryCount(ctx);

    earn(ctx, 500, "bounty", "ganger_dock");
    expect(wallet(ctx)).toBe(start + 500);
    const bounty = cashEntries(ctx, 1)[0]!;
    expect(bounty).toMatchObject({ amount: 500, reason: "bounty", ref: "ganger_dock", balanceAfter: start + 500 });

    expect(spend(ctx, 200, "bribe")).toBe(true);
    expect(wallet(ctx)).toBe(start + 300);
    expect(cashEntries(ctx, 1)[0]).toMatchObject({ amount: -200, reason: "bribe", balanceAfter: start + 300 });

    // An unaffordable spend posts nothing and moves nothing.
    const before = ledgerEntryCount(ctx);
    expect(spend(ctx, 1_000_000, "garage-purchase", "car_bus")).toBe(false);
    expect(ledgerEntryCount(ctx)).toBe(before);
    expect(wallet(ctx)).toBe(start + 300);

    expect(ledgerEntryCount(ctx)).toBe(startEntries + 2);
    expect(ledgerState(ctx).accounts[HERO]?.cash).toBe(wallet(ctx));
  });

  test("an engine path that moved the wallet itself still posts with its own reason", () => {
    const ctx = boot();
    openBooks(ctx);
    const start = wallet(ctx);
    // A job's cash reward is granted by the engine's reward system, not by this game.
    ctx.game.economy.grant(ctx.player.userId, "cash", 900);
    recordWalletChange(ctx, "job-reward", "dock_sweep");

    expect(cashEntries(ctx, 1)[0]).toMatchObject({ amount: 900, reason: "job-reward", ref: "dock_sweep" });
    expect(ledgerState(ctx).accounts[HERO]?.cash).toBe(start + 900);
    expect(wallet(ctx)).toBe(start + 900);
  });

  test("the journal reconciles to the wallet after a reload", () => {
    const host = boot();
    openBooks(host);
    earn(host, 3200, "race-purse", "ocean_loop");
    spend(host, 120, "clinic-fee");
    const saved = ledgerState(host);
    expect(saved.accounts[HERO]?.cash).toBe(wallet(host));

    // A reload restores the wallet from the world snapshot; the journal comes back from its section.
    const reboot = boot();
    reboot.game.economy.grant(reboot.player.userId, "cash", wallet(host));
    restoreLedger(reboot, saved);
    expect(ledgerState(reboot).accounts[HERO]?.cash).toBe(wallet(reboot));

    // The wallet drifted from the books (a movement nobody journaled): the next post squares it.
    reboot.game.economy.grant(reboot.player.userId, "cash", 75);
    earn(reboot, 10, "stash-claim", "stash_1");
    expect(ledgerState(reboot).accounts[HERO]?.cash).toBe(wallet(reboot));
    const reasons = cashEntries(reboot, 100).map((entry) => entry.reason);
    expect(reasons).toContain("race-purse");
    expect(reasons).toContain("stash-claim");
  });
});
