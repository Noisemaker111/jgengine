export interface ComboPointsConfig {
  max: number;
  expireAfterSeconds?: number;
}

/** Complete serializable state for {@link ComboPoints}; `remaining: null` means no expiry is running. */
export interface ComboPointsSnapshot {
  points: number;
  remaining: number | null;
  max: number;
  expireAfterSeconds: number | null;
}

export interface ComboPoints {
  points(): number;
  gain(amount?: number): number;
  spend(amount: number): boolean;
  spendAll(): number;
  tick(dtSeconds: number): void;
  expiresIn(): number | null;
  clear(): void;
  /** The whole builder as plain data — save it, ship it to a host, diff it in a test. */
  snapshot(): ComboPointsSnapshot;
  /** Adopt a snapshot, replacing points, expiry, and tuning. */
  restore(state: ComboPointsSnapshot): void;
}

/**
 * Build and spend finisher points — the combo-point economy behind rogue-style builders and spenders.
 *
 * @capability combo-points build up and spend finisher/combo points
 */
export function createComboPoints(config: ComboPointsConfig): ComboPoints {
  let max = config.max;
  let expireAfterSeconds = config.expireAfterSeconds;
  let current = 0;
  let remaining: number | null = null;

  return {
    points() {
      return current;
    },
    gain(amount = 1) {
      if (amount <= 0) return current;
      current = Math.min(max, current + amount);
      remaining = expireAfterSeconds !== undefined ? expireAfterSeconds : null;
      return current;
    },
    spend(amount) {
      if (amount <= 0) return true;
      if (amount > current) return false;
      current -= amount;
      if (current <= 0) remaining = null;
      return true;
    },
    spendAll() {
      const spent = current;
      current = 0;
      remaining = null;
      return spent;
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0 || remaining === null) return;
      remaining -= dtSeconds;
      if (remaining <= 0) {
        current = 0;
        remaining = null;
      }
    },
    expiresIn() {
      if (current <= 0 || remaining === null) return null;
      return remaining;
    },
    snapshot() {
      return { points: current, remaining, max, expireAfterSeconds: expireAfterSeconds ?? null };
    },
    restore(state) {
      max = state.max;
      expireAfterSeconds = state.expireAfterSeconds ?? undefined;
      current = Math.max(0, Math.min(max, state.points));
      remaining = current <= 0 ? null : state.remaining;
    },
    clear() {
      current = 0;
      remaining = null;
    },
  };
}
