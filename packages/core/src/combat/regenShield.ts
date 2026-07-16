/** Tuning for `createRegenShield`: pool size, refill rate, and the post-damage grace period. */
export interface RegenShieldConfig {
  max: number;
  /** Points restored per second once the post-damage grace period has elapsed. */
  regenPerSecond: number;
  /** Grace period after the last damage before regen resumes. */
  regenDelayMs: number;
  /** Starting value; defaults to `max` (full). */
  current?: number;
}

/**
 * A shield pool that stops regenerating for `regenDelayMs` after every hit, then refills at
 * `regenPerSecond` — the delayed-regen primitive that replaces snapshot-comparing stat values per
 * tick to detect "damage taken" (#536.3). `damage` resets the grace timer; `tick` counts it down and
 * regenerates once it elapses.
 */
export interface RegenShield {
  current(): number;
  max(): number;
  setMax(value: number): void;
  /** Change the refill rate at runtime (a level-up or item pickup that alters shield recharge). */
  setRegenPerSecond(value: number): void;
  /** Change the post-damage grace period at runtime (a talent or item that shortens/lengthens it). */
  setRegenDelayMs(value: number): void;
  fraction(): number;
  isFull(): boolean;
  isBroken(): boolean;
  /** True while the post-damage grace period is suppressing regen. */
  suppressed(): boolean;
  /** Absorb `amount` and reset the regen grace timer; returns damage that got through (0 while the shield holds). */
  damage(amount: number): number;
  /**
   * Restart the regen grace timer without subtracting from the pool — for a hit the shield did not
   * absorb (a health-only hit) or any event that should interrupt recharge.
   */
  poke(): void;
  /**
   * Mirror an externally-owned pool (one that another system, e.g. a shared damage pipeline or a stat
   * store, writes to instead of {@link damage}). Sets `current` to `value`; a decrease since the last
   * observation is treated as a hit and restarts the regen grace. Returns true when it detected a hit.
   */
  observeValue(value: number): boolean;
  /** Add `amount` without touching the regen timer (a pickup or scripted refill). */
  restore(amount: number): void;
  set(value: number): void;
  /** Advance time: count down the grace period, then regenerate once it has elapsed. */
  tick(dtSeconds: number): void;
}

/**
 * Builds a {@link RegenShield} that suppresses regen for `regenDelayMs` after each hit.
 *
 * @capability regen-shield a rechargeable overshield that absorbs damage and refills after a lull
 */
export function createRegenShield(config: RegenShieldConfig): RegenShield {
  let max = Math.max(0, config.max);
  let regenPerSecond = Math.max(0, config.regenPerSecond);
  let regenDelayMs = Math.max(0, config.regenDelayMs);

  function clamp(value: number, ceiling: number): number {
    return Math.max(0, Math.min(ceiling, value));
  }

  let current = clamp(config.current ?? max, max);
  let sinceDamageMs = regenDelayMs;

  return {
    current: () => current,
    max: () => max,
    setMax(value) {
      max = Math.max(0, value);
      current = clamp(current, max);
    },
    setRegenPerSecond(value) {
      regenPerSecond = Math.max(0, value);
    },
    setRegenDelayMs(value) {
      regenDelayMs = Math.max(0, value);
    },
    fraction: () => (max <= 0 ? 0 : current / max),
    isFull: () => current >= max,
    isBroken: () => current <= 0,
    suppressed: () => sinceDamageMs < regenDelayMs,
    damage(amount) {
      if (amount <= 0) return 0;
      sinceDamageMs = 0;
      const overflow = Math.max(0, amount - current);
      current = clamp(current - amount, max);
      return overflow;
    },
    poke() {
      sinceDamageMs = 0;
    },
    observeValue(value) {
      const dropped = value < current;
      current = value;
      if (dropped) sinceDamageMs = 0;
      return dropped;
    },
    restore(amount) {
      if (amount > 0) current = clamp(current + amount, max);
    },
    set(value) {
      current = clamp(value, max);
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      sinceDamageMs += dtSeconds * 1000;
      if (sinceDamageMs >= regenDelayMs) current = clamp(current + regenPerSecond * dtSeconds, max);
    },
  };
}
