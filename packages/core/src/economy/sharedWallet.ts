import { balance, charge, createEmptyWallet, grant, type WalletState } from "./wallet";

export type WalletScope =
  | { kind: "user"; userId: string }
  | { kind: "group"; groupId: string };

/** @internal */
export function scopeKey(scope: WalletScope): string {
  return scope.kind === "user" ? `user:${scope.userId}` : `group:${scope.groupId}`;
}

/** @internal */
export function userScope(userId: string): WalletScope {
  return { kind: "user", userId };
}

/** @internal */
export function groupScope(groupId: string): WalletScope {
  return { kind: "group", groupId };
}

export interface WalletBook {
  scopes: Readonly<Record<string, WalletState>>;
  contributions: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>;
}

export type BookChargeResult =
  | { status: "ok"; book: WalletBook }
  | { status: "rejected"; reason: "insufficient-funds" };

/**
 * Shared or group currency pools that track each member's contribution to a common balance.
 *
 * @capability shared-wallet shared/group currency pools tracking per-member contributions
  * @internal
  */
export function createWalletBook(): WalletBook {
  return { scopes: {}, contributions: {} };
}

function scopeState(book: WalletBook, key: string): WalletState {
  return book.scopes[key] ?? createEmptyWallet();
}

/** @internal */
export function balanceIn(book: WalletBook, scope: WalletScope, currency: string): number {
  return balance(scopeState(book, scopeKey(scope)), currency);
}

function withScope(book: WalletBook, key: string, state: WalletState): WalletBook {
  return { ...book, scopes: { ...book.scopes, [key]: state } };
}

function recordContribution(
  book: WalletBook,
  groupKey: string,
  userId: string,
  currency: string,
  delta: number,
): WalletBook {
  const group = book.contributions[groupKey] ?? {};
  const perUser = group[userId] ?? {};
  const next = (perUser[currency] ?? 0) + delta;
  return {
    ...book,
    contributions: {
      ...book.contributions,
      [groupKey]: {
        ...group,
        [userId]: { ...perUser, [currency]: next },
      },
    },
  };
}

/** @internal */
export function grantTo(
  book: WalletBook,
  scope: WalletScope,
  currency: string,
  amount: number,
  by?: string,
): WalletBook {
  const key = scopeKey(scope);
  let next = withScope(book, key, grant(scopeState(book, key), currency, amount));
  if (scope.kind === "group" && by !== undefined) {
    next = recordContribution(next, key, by, currency, amount);
  }
  return next;
}

/** @internal */
export function chargeFrom(
  book: WalletBook,
  scope: WalletScope,
  currency: string,
  amount: number,
  by?: string,
): BookChargeResult {
  const key = scopeKey(scope);
  const result = charge(scopeState(book, key), currency, amount);
  if (result.status === "rejected") return result;
  let next = withScope(book, key, result.state);
  if (scope.kind === "group" && by !== undefined) {
    next = recordContribution(next, key, by, currency, -amount);
  }
  return { status: "ok", book: next };
}

/** @internal */
export function contributionOf(
  book: WalletBook,
  groupId: string,
  userId: string,
): Readonly<Record<string, number>> {
  return book.contributions[scopeKey(groupScope(groupId))]?.[userId] ?? {};
}

/** @internal */
export function contributorsOf(book: WalletBook, groupId: string): string[] {
  return Object.keys(book.contributions[scopeKey(groupScope(groupId))] ?? {});
}
