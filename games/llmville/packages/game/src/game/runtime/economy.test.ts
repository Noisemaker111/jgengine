import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  canAfford,
  chargeCurrency,
  currencyBalance,
  grantCurrency,
  grantUnlock,
  hasUnlock,
} from "@llmville/game/game/runtime/economy";

function snapshot(economy: Record<string, number>, unlocks: string[] = []): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: { user_1: { userId: "user_1", inventories: {}, economy, unlocks } },
    chunks: {},
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
}

const CHARGE = { userId: "user_1", type: "expense_shop", description: "Bought a rack" } as const;

describe("runtime economy", () => {
  test("reads a missing balance as zero", () => {
    expect(currencyBalance(snapshot({}), "user_1", "money")).toBe(0);
    expect(currencyBalance(snapshot({ money: 250 }), "user_1", "money")).toBe(250);
  });

  test("charges a balance and marks the player dirty", () => {
    const result = chargeCurrency(snapshot({ money: 100 }), { ...CHARGE, currency: "money", amount: 40 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balanceAfter).toBe(60);
    expect(result.snapshot.dirty.players).toEqual(["user_1"]);
    expect(result.entry).toEqual({
      currency: "money",
      type: "expense_shop",
      amount: -40,
      balanceAfter: 60,
      description: "Bought a rack",
    });
  });

  test("refuses a charge the player cannot afford and leaves the balance alone", () => {
    const base = snapshot({ money: 10 });
    const result = chargeCurrency(base, { ...CHARGE, currency: "money", amount: 40 });
    expect(result.ok).toBe(false);
    expect(currencyBalance(base, "user_1", "money")).toBe(10);
  });

  test("grants a balance", () => {
    const result = grantCurrency(snapshot({ data: 5 }), {
      ...CHARGE,
      currency: "data",
      amount: 20,
      type: "income_passive",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balanceAfter).toBe(25);
  });

  test("keeps the two currencies independent", () => {
    const result = chargeCurrency(snapshot({ money: 100, data: 7 }), {
      ...CHARGE,
      currency: "money",
      amount: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currencyBalance(result.snapshot, "user_1", "data")).toBe(7);
  });

  test("rejects a charge against an unknown player", () => {
    const result = chargeCurrency(snapshot({ money: 100 }), {
      ...CHARGE,
      userId: "nobody",
      currency: "money",
      amount: 1,
    });
    expect(result).toEqual({ ok: false, reason: "Unknown player" });
  });

  test("answers affordability without mutating", () => {
    const base = snapshot({ money: 40 });
    expect(canAfford(base, "user_1", "money", 40)).toBe(true);
    expect(canAfford(base, "user_1", "money", 41)).toBe(false);
  });

  test("grants an unlock once and is idempotent", () => {
    const base = snapshot({}, []);
    expect(hasUnlock(base, "user_1", "base_1")).toBe(false);
    const granted = grantUnlock(base, "user_1", "base_1");
    expect(hasUnlock(granted, "user_1", "base_1")).toBe(true);
    expect(grantUnlock(granted, "user_1", "base_1")).toBe(granted);
  });
});
