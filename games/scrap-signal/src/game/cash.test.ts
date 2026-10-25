import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { cashEntries, earn, ledgerState, restoreLedger, spend } from "./cash";

function boot(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "scrap-cash-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
    }),
    content: {},
    player: { userId: "p1", isNew: true },
    save: { backend: memorySaveBackend(), key: "jgengine:save:scrap-cash", mode: "manual" },
  });
}

describe("scrap transaction ledger", () => {
  test("every earn and spend is posted with its reason and keeps the wallet in step", () => {
    const ctx = boot();
    earn(ctx, "cores", 12, "kill-cores", "husk");
    expect(spend(ctx, "cores", 5, "black-market-upgrade", "ammo")).toBe(true);
    expect(ctx.game.economy.balance("p1", "cores")).toBe(7);
    const entries = cashEntries(ctx);
    expect(entries.map((entry) => entry.reason)).toEqual(["kill-cores", "black-market-upgrade"]);
    expect(ledgerState(ctx).accounts.p1!.cores).toBe(7);
  });

  test("a purchase the wallet cannot cover moves nothing and posts nothing", () => {
    const ctx = boot();
    earn(ctx, "cash", 30, "relay-reward", "dead-air");
    const before = cashEntries(ctx).length;
    expect(spend(ctx, "cash", 45, "shop-purchase", "insta_health")).toBe(false);
    expect(ctx.game.economy.balance("p1", "cash")).toBe(30);
    expect(cashEntries(ctx).length).toBe(before);
  });

  test("a movement the game did not make is reconciled into the journal once", () => {
    const ctx = boot();
    // The engine loadout opens the wallet with starting cash before any game path runs.
    ctx.game.economy.grant("p1", "cash", 50);
    earn(ctx, "cash", 10, "relay-reward");
    expect(cashEntries(ctx).map((entry) => entry.reason)).toEqual(["reconcile", "relay-reward"]);
    expect(cashEntries(ctx)[0]!.balanceAfter).toBe(50);
  });

  test("a restored journal aligns itself to the wallet, so a stale document cannot overdraw", () => {
    const ctx = boot();
    earn(ctx, "cores", 4, "kill-cores");
    const state = ledgerState(ctx);
    expect(restoreLedger(ctx, state)).toBeUndefined();
    expect(ctx.game.economy.balance("p1", "cores")).toBe(4);
    ctx.game.economy.grant("p1", "cores", 6);
    restoreLedger(ctx, state);
    expect(ctx.game.economy.balance("p1", "cores")).toBe(10);
    expect(cashEntries(ctx).at(-1)?.reason).toBe("reconcile");
  });
});
