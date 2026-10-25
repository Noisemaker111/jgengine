import { createTransactionLedger, type LedgerState, type TransactionLedger } from "@jgengine/core/economy/transactionLedger";
import type { TradeRejection } from "@jgengine/core/game/trade";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { SHOP_ID } from "./items/gear/catalog";

/**
 * Every scrip movement in the relay, with the reason it happened. The engine wallet
 * (`ctx.game.economy`) stays the balance the trade subsystem and the world snapshot own; this ledger
 * is the journal over it, aligned to the wallet before each post and again after a load, so no
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
  | "reconcile";

export const CASH = "cash";
export const CORES = "cores";

interface Books {
  ledger: TransactionLedger;
}

const booksOf = perContext((): Books => ({ ledger: createTransactionLedger({ devtoolsName: "scrap.ledger" }) }));

function ledgerOf(ctx: GameContext): TransactionLedger {
  const ledger = booksOf(ctx).ledger;
  const userId = ctx.player.userId;
  ledger.openAccount(userId, CASH);
  ledger.openAccount(userId, CORES);
  return ledger;
}

/** Align the journal's mirror to the live wallet, recording only a real difference. */
function reconcile(ctx: GameContext, currency: string): void {
  const ledger = ledgerOf(ctx);
  const userId = ctx.player.userId;
  const wallet = ctx.game.economy.balance(userId, currency);
  const mine = ledger.balanceOf(userId, currency);
  if (wallet === mine) return;
  ledger.post({ account: userId, currency, amount: wallet - mine, reason: "reconcile", at: ctx.time.now(), overdraft: true });
}

/** Record a movement that already happened in the wallet (the engine's own trade path). */
function record(ctx: GameContext, currency: string, delta: number, reason: CashReason, ref?: string): void {
  if (delta === 0) return;
  const ledger = ledgerOf(ctx);
  const userId = ctx.player.userId;
  ledger.post({
    account: userId,
    currency,
    amount: delta,
    reason,
    at: ctx.time.now(),
    ...(ref === undefined ? {} : { ref }),
    overdraft: true,
  });
}

/** Add scrip and journal why. */
export function earn(ctx: GameContext, currency: string, amount: number, reason: CashReason, ref?: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  reconcile(ctx, currency);
  ctx.game.economy.grant(ctx.player.userId, currency, amount);
  record(ctx, currency, amount, reason, ref);
}

/** Spend scrip if the wallet covers it, journaling the purchase. Returns false without moving anything. */
export function spend(ctx: GameContext, currency: string, amount: number, reason: CashReason, ref?: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return true;
  reconcile(ctx, currency);
  if (ctx.game.economy.charge(ctx.player.userId, currency, amount) !== null) return false;
  record(ctx, currency, -amount, reason, ref);
  return true;
}

/**
 * The engine's shop buys from its own stock and charges the wallet itself; read the wallet around it
 * so that movement lands in the journal too. Returns the shop's rejection reason, or null on success.
 */
export function buyGear(ctx: GameContext, itemId: string): TradeRejection | null {
  const trade = ctx.game.trade;
  if (trade === undefined) return { reason: "no-trade" };
  reconcile(ctx, CASH);
  const before = ctx.game.economy.balance(ctx.player.userId, CASH);
  const rejection = trade.buy(itemId, 1, { shop: SHOP_ID, inventoryId: "backpack" });
  if (rejection !== null) return rejection;
  record(ctx, CASH, ctx.game.economy.balance(ctx.player.userId, CASH) - before, "shop-purchase", itemId);
  return null;
}

export function cashBalance(ctx: GameContext, currency: string): number {
  return ctx.game.economy.balance(ctx.player.userId, currency);
}

/** Journal entries, newest last, for a HUD receipt or a test. */
export function cashEntries(ctx: GameContext, limit = 20): ReturnType<TransactionLedger["entries"]> {
  return ledgerOf(ctx).entries({ limit });
}

export function ledgerState(ctx: GameContext): LedgerState {
  return ledgerOf(ctx).snapshot();
}

/** Restore a saved journal and align it to the wallet the world snapshot already restored. */
export function restoreLedger(ctx: GameContext, state: LedgerState): void {
  const ledger = ledgerOf(ctx);
  if (!ledger.restore(state)) return;
  reconcile(ctx, CASH);
  reconcile(ctx, CORES);
}

export function resetLedger(ctx: GameContext): void {
  booksOf(ctx).ledger.reset();
}

/** Open the player's accounts at boot so the journal is live before the first movement. */
export function openBooks(ctx: GameContext): void {
  ledgerOf(ctx);
  reconcile(ctx, CASH);
  reconcile(ctx, CORES);
}
