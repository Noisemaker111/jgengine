import { createTransactionLedger, type LedgerState, type TransactionLedger } from "@jgengine/core/economy/transactionLedger";
import type { TradeRejection } from "@jgengine/core/game/trade";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

/**
 * Every cash movement on Harbor Heat with the reason it happened. The engine wallet
 * (`ctx.game.economy`) stays the balance the trade subsystem, the HUD and the world snapshot own;
 * this ledger is the journal over it, squared to the wallet before each post and again after a load,
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

const booksOf = perContext((): { ledger: TransactionLedger } => ({
  ledger: createTransactionLedger({ devtoolsName: "harbor.ledger" }),
}));

function ledgerOf(ctx: GameContext): TransactionLedger {
  const ledger = booksOf(ctx).ledger;
  // A fresh account opens at the wallet's balance, so the journal starts square instead of
  // explaining a starting grant it never saw.
  ledger.openAccount(ctx.player.userId, CASH, ctx.game.economy.balance(ctx.player.userId, CASH));
  return ledger;
}

/** Align the journal's mirror to the live wallet, recording only a real difference. */
function reconcile(ctx: GameContext, reason: CashReason = "reconcile", ref?: string): void {
  const ledger = ledgerOf(ctx);
  const userId = ctx.player.userId;
  const wallet = ctx.game.economy.balance(userId, CASH);
  const mine = ledger.balanceOf(userId, CASH);
  if (wallet === mine) return;
  ledger.post({
    account: userId,
    currency: CASH,
    amount: wallet - mine,
    reason,
    at: ctx.time.now(),
    ...(ref === undefined ? {} : { ref }),
    overdraft: true,
  });
}

/** Record a movement that already happened in the wallet (an engine path owns the balance). */
function record(ctx: GameContext, delta: number, reason: CashReason, ref?: string): void {
  if (delta === 0) return;
  ledgerOf(ctx).post({
    account: ctx.player.userId,
    currency: CASH,
    amount: delta,
    reason,
    at: ctx.time.now(),
    ...(ref === undefined ? {} : { ref }),
    overdraft: true,
  });
}

/** Add cash and journal why. */
export function earn(ctx: GameContext, amount: number, reason: CashReason, ref?: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  reconcile(ctx);
  ctx.game.economy.grant(ctx.player.userId, CASH, amount);
  record(ctx, amount, reason, ref);
}

/** Spend cash if the wallet covers it, journaling the purchase. Returns false without moving anything. */
export function spend(ctx: GameContext, amount: number, reason: CashReason, ref?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  reconcile(ctx);
  if (ctx.game.economy.charge(ctx.player.userId, CASH, amount) !== null) return false;
  record(ctx, -amount, reason, ref);
  return true;
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
  reconcile(ctx);
  const before = ctx.game.economy.balance(ctx.player.userId, CASH);
  const rejection = trade.buy(itemId, 1, options);
  if (rejection !== null) return rejection;
  record(ctx, ctx.game.economy.balance(ctx.player.userId, CASH) - before, "shop-purchase", itemId);
  return null;
}

/**
 * An engine path (a quest's reward, a courier contract) moved cash itself. Post the difference under
 * the reason it happened instead of waiting for the next unrelated movement to reconcile it.
 */
export function recordWalletChange(ctx: GameContext, reason: CashReason, ref?: string): void {
  reconcile(ctx, reason, ref);
}

export function cashEntries(ctx: GameContext, limit = 20): ReturnType<TransactionLedger["entries"]> {
  return ledgerOf(ctx).entries({ limit });
}

export function ledgerState(ctx: GameContext): LedgerState {
  return ledgerOf(ctx).snapshot();
}

/** Restore a saved journal and square it to the wallet the world snapshot already restored. */
export function restoreLedger(ctx: GameContext, state: LedgerState): void {
  const ledger = ledgerOf(ctx);
  if (!ledger.restore(state)) return;
  reconcile(ctx);
}

export function resetLedger(ctx: GameContext): void {
  booksOf(ctx).ledger.reset();
}

/** Open the player's account at boot so the journal is live before the first movement. */
export function openBooks(ctx: GameContext): void {
  ledgerOf(ctx);
  reconcile(ctx);
}

/** How many journal entries the ledger holds - a test reads this to prove a movement posted. */
export function ledgerEntryCount(ctx: GameContext): number {
  return ledgerOf(ctx).stats().entries;
}
