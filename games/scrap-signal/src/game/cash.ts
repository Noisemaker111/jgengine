import type { LedgerEntry, LedgerState } from "@jgengine/core/economy/transactionLedger";
import { createWalletBooks, type WalletBooks } from "@jgengine/core/economy/walletBooks";
import type { TradeRejection } from "@jgengine/core/game/trade";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { SHOP_ID } from "./items/gear/catalog";

/**
 * Every scrip movement in the relay, with the reason it happened. The engine wallet
 * (`ctx.game.economy`) stays the balance the trade subsystem and the world snapshot own; the shared
 * wallet books journal it, aligned to the wallet before each post and again after a load, so no
 * purchase, salvage yield or fee can move money without a reason on the record.
 */
export type CashReason =
  | "kill-cores"
  | "relay-reward"
  | "mast-reward"
  | "rift-reward"
  | "rift-reroll"
  | "respec"
  | "salvage"
  | "respawn-fee"
  | "shop-purchase"
  | "ammo-purchase"
  | "black-market-upgrade"
  | "gun-of-the-day"
  | "quest-reward"
  | "reconcile";

export const CASH = "cash";
export const CORES = "cores";

// The accounts open at zero and the wallet's balance posts as a reconcile, as the relay always did.
const booksOf = perContext((ctx: GameContext): WalletBooks => createWalletBooks({
  account: ctx.player.userId,
  currencies: [CASH, CORES],
  balance: (currency) => ctx.game.economy.balance(ctx.player.userId, currency),
  now: () => ctx.time.now(),
  opening: "reconcile",
  ledger: { devtoolsName: "scrap.ledger" },
}));

/** Add scrip and journal why. */
export function earn(ctx: GameContext, currency: string, amount: number, reason: CashReason, ref?: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  booksOf(ctx).track(reason, () => ctx.game.economy.grant(ctx.player.userId, currency, amount), ref);
}

/** Spend scrip if the wallet covers it, journaling the purchase. Returns false without moving anything. */
export function spend(ctx: GameContext, currency: string, amount: number, reason: CashReason, ref?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  return booksOf(ctx).track(reason, () => ctx.game.economy.charge(ctx.player.userId, currency, amount) === null, ref);
}

/**
 * The engine's shop buys from its own stock and charges the wallet itself; read the wallet around it
 * so that movement lands in the journal too. Returns the shop's rejection reason, or null on success.
 */
export function buyGear(ctx: GameContext, itemId: string): TradeRejection | null {
  const trade = ctx.game.trade;
  if (trade === undefined) return { reason: "no-trade" };
  return booksOf(ctx).track("shop-purchase", () => trade.buy(itemId, 1, { shop: SHOP_ID, inventoryId: "backpack" }), itemId);
}

export function cashBalance(ctx: GameContext, currency: string): number {
  return ctx.game.economy.balance(ctx.player.userId, currency);
}

/** Journal entries, newest last, for a HUD receipt or a test. */
export function cashEntries(ctx: GameContext, limit = 20): LedgerEntry[] {
  return booksOf(ctx).entries({ limit });
}

export function ledgerState(ctx: GameContext): LedgerState {
  return booksOf(ctx).snapshot();
}

/** Restore a saved journal and align it to the wallet the world snapshot already restored. */
export function restoreLedger(ctx: GameContext, state: LedgerState): void {
  booksOf(ctx).restore(state);
}

export function resetLedger(ctx: GameContext): void {
  booksOf(ctx).reset("reconcile");
}

/** Open the player's accounts at boot so the journal is live before the first movement. */
export function openBooks(ctx: GameContext): void {
  booksOf(ctx).square();
}
