import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  applyCurrencyOperation,
  resolveCurrencyDelta,
  sanitizeCurrencyAmount,
  type CurrencyOperation,
} from "@jgengine/core/economy/currency";
import {
  CURRENCIES,
  type CurrencyId,
} from "@llmville/game/economy/currency";
import { patchPlayerState, readPlayerState } from "./playerProfile";

export type { CurrencyId } from "@llmville/game/economy/currency";

export type AdjustCurrencyResult = { success: true; newBalance: number } | { success: false; reason: string };
const ERRORS = {
  gameNotFound: "Game not found",
} as const;

export async function currencyBalanceForOwner(ctx: QueryCtx, ownerExternalId: string, currency: CurrencyId): Promise<number> {
  return (await readPlayerState(ctx, ownerExternalId)).economy[currency] ?? 0;
}

export async function currencyBalance(ctx: QueryCtx, game: Doc<"games">, currency: CurrencyId): Promise<number> {
  return currencyBalanceForOwner(ctx, game.createdBy, currency);
}

export async function currencyBalances(ctx: QueryCtx, game: Doc<"games">): Promise<Record<CurrencyId, number>> {
  const economy = (await readPlayerState(ctx, game.createdBy)).economy;
  return { money: economy.money ?? 0, data: economy.data ?? 0 };
}

export async function seedOwnerEconomy(ctx: MutationCtx, ownerExternalId: string, economy: Record<CurrencyId, number>) {
  await patchPlayerState(ctx, ownerExternalId, (state) => ({ ...state, economy }));
}

async function writeBalance(ctx: MutationCtx, ownerExternalId: string, currency: CurrencyId, balance: number) {
  await patchPlayerState(ctx, ownerExternalId, (state) => ({ ...state, economy: { ...state.economy, [currency]: balance } }));
}

export async function adjustCurrency(ctx: MutationCtx, gameId: Id<"games">, currency: CurrencyId, operation: CurrencyOperation, amount: number): Promise<AdjustCurrencyResult> {
  const game = await ctx.db.get(gameId);
  if (!game) return sanitizeCurrencyAmount(amount, CURRENCIES[currency]) === 0 ? { success: true, newBalance: 0 } : { success: false, reason: ERRORS.gameNotFound };
  const adjustment = applyCurrencyOperation(CURRENCIES[currency], await currencyBalance(ctx, game, currency), operation, amount);
  if (!adjustment.success) return adjustment;
  if (adjustment.appliedDelta !== 0) await writeBalance(ctx, game.createdBy, currency, adjustment.newBalance);
  return { success: true, newBalance: adjustment.newBalance };
}

export function addCurrency(ctx: MutationCtx, gameId: Id<"games">, currency: CurrencyId, amount: number): Promise<AdjustCurrencyResult> {
  return adjustCurrency(ctx, gameId, currency, "add", amount);
}

export function deductCurrency(ctx: MutationCtx, gameId: Id<"games">, currency: CurrencyId, amount: number): Promise<AdjustCurrencyResult> {
  return adjustCurrency(ctx, gameId, currency, "deduct", amount);
}

export async function adjustCurrencyByDelta(ctx: MutationCtx, gameId: Id<"games">, currency: CurrencyId, delta: number): Promise<AdjustCurrencyResult> {
  const game = await ctx.db.get(gameId);
  if (!game) return delta === 0 ? { success: true, newBalance: 0 } : { success: false, reason: ERRORS.gameNotFound };
  const current = await currencyBalance(ctx, game, currency);
  const { operation, amount } = resolveCurrencyDelta(current, delta, CURRENCIES[currency]);
  return amount === 0 ? { success: true, newBalance: current } : adjustCurrency(ctx, gameId, currency, operation, amount);
}
