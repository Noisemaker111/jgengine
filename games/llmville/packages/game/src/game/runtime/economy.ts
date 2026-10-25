import { applyCurrencyOperation } from "@jgengine/core/economy/currency";
import type { GameRuntimeSnapshot, RuntimePlayerRow } from "@jgengine/core/runtime/snapshot";
import { CURRENCIES, type CurrencyId, type TransactionType } from "@llmville/game/economy/currency";

export interface CurrencyChargeInput {
  userId: string;
  currency: CurrencyId;
  amount: number;
  type: TransactionType;
  description: string;
}

export interface CurrencyLedgerEntry {
  currency: CurrencyId;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
}

export type CurrencyChargeResult =
  | { ok: true; snapshot: GameRuntimeSnapshot; balanceAfter: number; entry: CurrencyLedgerEntry }
  | { ok: false; reason: string };

function playerRow(snapshot: GameRuntimeSnapshot, userId: string): RuntimePlayerRow | undefined {
  return snapshot.players[userId];
}

export function currencyBalance(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  currency: CurrencyId,
): number {
  return playerRow(snapshot, userId)?.economy[currency] ?? 0;
}

export function canAfford(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  currency: CurrencyId,
  amount: number,
): boolean {
  return currencyBalance(snapshot, userId, currency) >= amount;
}

function writeBalance(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  currency: CurrencyId,
  balance: number,
): GameRuntimeSnapshot {
  const player = playerRow(snapshot, userId);
  if (player === undefined) return snapshot;
  return {
    ...snapshot,
    players: {
      ...snapshot.players,
      [userId]: { ...player, economy: { ...player.economy, [currency]: balance } },
    },
    dirty: {
      ...snapshot.dirty,
      players: snapshot.dirty.players.includes(userId)
        ? snapshot.dirty.players
        : [...snapshot.dirty.players, userId],
    },
  };
}

function adjust(
  snapshot: GameRuntimeSnapshot,
  input: CurrencyChargeInput,
  operation: "add" | "deduct",
): CurrencyChargeResult {
  if (playerRow(snapshot, input.userId) === undefined) {
    return { ok: false, reason: "Unknown player" };
  }
  const adjustment = applyCurrencyOperation(
    CURRENCIES[input.currency],
    currencyBalance(snapshot, input.userId, input.currency),
    operation,
    input.amount,
  );
  if (!adjustment.success) return { ok: false, reason: adjustment.reason };
  return {
    ok: true,
    snapshot: writeBalance(snapshot, input.userId, input.currency, adjustment.newBalance),
    balanceAfter: adjustment.newBalance,
    entry: {
      currency: input.currency,
      type: input.type,
      amount: adjustment.appliedDelta,
      balanceAfter: adjustment.newBalance,
      description: input.description,
    },
  };
}

export function chargeCurrency(
  snapshot: GameRuntimeSnapshot,
  input: CurrencyChargeInput,
): CurrencyChargeResult {
  return adjust(snapshot, input, "deduct");
}

export function grantCurrency(
  snapshot: GameRuntimeSnapshot,
  input: CurrencyChargeInput,
): CurrencyChargeResult {
  return adjust(snapshot, input, "add");
}

export function hasUnlock(snapshot: GameRuntimeSnapshot, userId: string, unlockId: string): boolean {
  return playerRow(snapshot, userId)?.unlocks.includes(unlockId) ?? false;
}

export function grantUnlock(
  snapshot: GameRuntimeSnapshot,
  userId: string,
  unlockId: string,
): GameRuntimeSnapshot {
  const player = playerRow(snapshot, userId);
  if (player === undefined || player.unlocks.includes(unlockId)) return snapshot;
  return {
    ...snapshot,
    players: {
      ...snapshot.players,
      [userId]: { ...player, unlocks: [...player.unlocks, unlockId] },
    },
    dirty: {
      ...snapshot.dirty,
      players: snapshot.dirty.players.includes(userId)
        ? snapshot.dirty.players
        : [...snapshot.dirty.players, userId],
    },
  };
}
