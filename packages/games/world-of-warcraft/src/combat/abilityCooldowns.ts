const remainingByKey = new Map<string, number>();
const flashUntilByKey = new Map<string, number>();

function key(userId: string, itemId: string): string {
  return `${userId}:${itemId}`;
}

export function tickAbilityCooldowns(dt: number, nowSeconds: number): void {
  for (const [entryKey, remaining] of remainingByKey) {
    const next = remaining - dt;
    if (next <= 0) remainingByKey.delete(entryKey);
    else remainingByKey.set(entryKey, next);
  }
  for (const [entryKey, until] of flashUntilByKey) {
    if (until <= nowSeconds) flashUntilByKey.delete(entryKey);
  }
}

export function startAbilityCooldown(userId: string, itemId: string, seconds: number): void {
  if (seconds <= 0) return;
  const existing = remainingByKey.get(key(userId, itemId)) ?? 0;
  remainingByKey.set(key(userId, itemId), Math.max(existing, seconds));
}

export function abilityCooldownRemaining(userId: string, itemId: string): number {
  return remainingByKey.get(key(userId, itemId)) ?? 0;
}

export function isAbilityReady(userId: string, itemId: string): boolean {
  return abilityCooldownRemaining(userId, itemId) <= 0;
}

export function flashAbility(userId: string, itemId: string, nowSeconds: number, durationSeconds = 0.22): void {
  flashUntilByKey.set(key(userId, itemId), nowSeconds + durationSeconds);
}

export function isAbilityFlashing(userId: string, itemId: string, nowSeconds: number): boolean {
  const until = flashUntilByKey.get(key(userId, itemId));
  return until !== undefined && until > nowSeconds;
}

