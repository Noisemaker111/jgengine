import { createWalletBooks, type WalletBooks } from "@jgengine/core/economy/walletBooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { GOLD, LUMBER } from "./tuning";

/**
 * Why gold or lumber moved, as the vale's books record it. The engine wallet (`ctx.game.economy`)
 * stays the balance the HUD, the affordability gates and the save read; every movement goes through
 * `earn`/`spend` here, which post it to the shared transaction ledger with its reason.
 */
export type TreasuryReason =
  | "starting-stockpile"
  | "campaign-stores"
  | "harvest"
  | "kill-bounty"
  | "income-trickle"
  | "build"
  | "train"
  | "research"
  | "dev-grant"
  | "reconcile";

const CURRENCIES = [GOLD, LUMBER] as const;

const booksOf = perContext((ctx: GameContext): WalletBooks => createWalletBooks({
  account: ctx.player.userId,
  currencies: CURRENCIES,
  balance: (currency) => ctx.game.economy.balance(ctx.player.userId, currency),
  now: () => ctx.time.now(),
  opening: "starting-stockpile",
}));

/** The vale's books: every gold and lumber movement with the reason it happened. */
export function treasuryBooks(ctx: GameContext): WalletBooks {
  return booksOf(ctx);
}

/** Add to the stockpile and book why. */
export function earn(ctx: GameContext, currency: string, amount: number, reason: TreasuryReason, ref?: string): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  booksOf(ctx).track(reason, () => ctx.game.economy.grant(ctx.player.userId, currency, amount), ref);
}

/** Pay a whole cost if the stockpile covers every part of it, booking each part. Returns false without moving anything. */
export function spend(ctx: GameContext, cost: Readonly<Record<string, number>>, reason: TreasuryReason, ref?: string): boolean {
  const userId = ctx.player.userId;
  for (const [currency, amount] of Object.entries(cost)) if (ctx.game.economy.balance(userId, currency) < amount) return false;
  booksOf(ctx).track(reason, () => {
    for (const [currency, amount] of Object.entries(cost)) if (amount > 0) ctx.game.economy.charge(userId, currency, amount);
  }, ref);
  return true;
}

/**
 * Open a battle's stockpile: the wallet empties, the books start over, and the opening stockpile is
 * the first entry, so the history alone explains every balance that follows.
 */
export function openTreasury(ctx: GameContext, stockpile: Readonly<Record<string, number>>): void {
  const userId = ctx.player.userId;
  for (const currency of CURRENCIES) {
    const amount = ctx.game.economy.balance(userId, currency);
    if (amount > 0) ctx.game.economy.charge(userId, currency, amount);
  }
  booksOf(ctx).reset();
  for (const [currency, amount] of Object.entries(stockpile)) earn(ctx, currency, amount, "starting-stockpile");
}
