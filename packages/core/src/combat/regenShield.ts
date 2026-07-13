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
  fraction(): number;
  isFull(): boolean;
  isBroken(): boolean;
  /** True while the post-damage grace period is suppressing regen. */
  suppressed(): boolean;
  /** Absorb `amount` and reset the regen grace timer; returns damage that got through (0 while the shield holds). */
  damage(amount: number): number;
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
  const regenPerSecond = Math.max(0, config.regenPerSecond);
  const regenDelayMs = Math.max(0, config.regenDelayMs);

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
