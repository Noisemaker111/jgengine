import type { LedgerEntry, LedgerState } from "@jgengine/core/economy/transactionLedger";
import { createWalletBooks, type WalletBooks } from "@jgengine/core/economy/walletBooks";
import type { TradeRejection } from "@jgengine/core/game/trade";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/**
 * Every cash movement on Harbor Heat with the reason it happened. The engine wallet
 * (`ctx.game.economy`) stays the balance the trade subsystem, the HUD and the world snapshot own;
 * the shared wallet books journal it, squared to the wallet before each post and again after a load,
 * so no bounty, purse, purchase or fine can move money without a reason on the record.
 */
export type CashReason =
  | "bounty"
  | "job-reward"
  | "race-entry"
  | "race-purse"
  | "race-record"
  | "race-refund"
  | "garage-purchase"
  | "safehouse-purchase"
  | "upgrade-purchase"
  | "bribe"
  | "shop-purchase"
  | "market-purchase"
  | "market-refund"
  | "courier-payout"
  | "courier-bonus"
  | "courier-bond"
  | "courier-damage"
  | "gig-fare"
  | "gig-tip"
  | "gig-streak"
  | "gig-stake"
  | "gig-purse"
  | "stash-claim"
  | "stash-bonus"
  | "busted-fine"
  | "clinic-fee"
  | "front-purchase"
  | "front-refund"
  | "front-takings"
  | "front-repair"
  | "payoff"
  | "respray"
  | "reconcile";

export const CASH = "cash";

// A fresh account opens at the wallet's balance, so the journal starts square instead of explaining a
// starting grant it never saw.
const booksOf = perContext((ctx: GameContext): WalletBooks => createWalletBooks({
  account: ctx.player.userId,
  currencies: [CASH],
  balance: (currency) => ctx.game.economy.balance(ctx.player.userId, currency),
  now: () => ctx.time.now(),
  ledger: { devtoolsName: "harbor.ledger" },
}));

/** Add cash and journal why. */
export function earn(ctx: GameContext, amount: number, reason: CashReason, ref?: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  booksOf(ctx).track(reason, () => ctx.game.economy.grant(ctx.player.userId, CASH, amount), ref);
}

/** Spend cash if the wallet covers it, journaling the purchase. Returns false without moving anything. */
export function spend(ctx: GameContext, amount: number, reason: CashReason, ref?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  return booksOf(ctx).track(reason, () => ctx.game.economy.charge(ctx.player.userId, CASH, amount) === null, ref);
}

/**
 * The engine's shop buys from its own stock and charges the wallet itself; read the wallet around it
 * so that movement lands in the journal too. Returns the shop's rejection reason, or null on success.
 */
export function buyFromShop(
  ctx: GameContext,
  itemId: string,
  options: { shop: string; inventoryId: string },
): TradeRejection | null {
  const trade = ctx.game.trade;
  if (trade === undefined) return { reason: "no-trade" };
  return booksOf(ctx).track("shop-purchase", () => trade.buy(itemId, 1, options), itemId);
}

/**
 * An engine path (a quest's reward, a courier contract) moved cash itself. Post the difference under
 * the reason it happened instead of waiting for the next unrelated movement to reconcile it.
 */
export function recordWalletChange(ctx: GameContext, reason: CashReason, ref?: string): void {
  booksOf(ctx).square(reason, ref);
}

export function cashEntries(ctx: GameContext, limit = 20): LedgerEntry[] {
  return booksOf(ctx).entries({ limit });
}

export function ledgerState(ctx: GameContext): LedgerState {
  return booksOf(ctx).snapshot();
}

/** Restore a saved journal and square it to the wallet the world snapshot already restored. */
export function restoreLedger(ctx: GameContext, state: LedgerState): void {
  booksOf(ctx).restore(state);
}

export function resetLedger(ctx: GameContext): void {
  booksOf(ctx).reset();
}

/** Open the player's account at boot so the journal is live before the first movement. */
export function openBooks(ctx: GameContext): void {
  booksOf(ctx).square();
}

/** How many journal entries the ledger holds - a test reads this to prove a movement posted. */
export function ledgerEntryCount(ctx: GameContext): number {
  return booksOf(ctx).ledger.stats().entries;
}
