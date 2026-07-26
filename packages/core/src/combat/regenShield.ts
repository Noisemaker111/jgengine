/**
 * External storage a {@link RegenShield} reads and writes instead of keeping the value itself —
 * an entity stat, a replicated store, a save record. This is the same port `Magazine` exposes as
 * `MagazineReserve`, and it exists for the same reason: in most games the shield value is already
 * owned by the stat system that damage, the HUD, and replication all read, so a primitive that
 * insists on owning the number privately cannot be adopted without creating a second source of truth.
 *
 * A pool-backed shield also watches for *external* decreases — damage applied through the game's own
 * effect pipeline rather than through `damage()` — and restarts the regen grace period when it sees
 * one, which is the per-entity snapshot bookkeeping games otherwise hand-roll.
 */
export interface RegenShieldPool {
  current(): number;
  max(): number;
  /** Write the value back; implementations clamp to their own bounds. */
  set(value: number): void;
}

/** Tuning for `createRegenShield`: pool size, refill rate, and the post-damage grace period. */
export interface RegenShieldConfig {
  max: number;
  /** Points restored per second once the post-damage grace period has elapsed. */
  regenPerSecond: number;
  /** Grace period after the last damage before regen resumes. */
  regenDelayMs: number;
  /** Starting value; defaults to `max` (full). Ignored when `pool` is set — the pool owns the value. */
  current?: number;
  /**
   * Back this shield with external storage instead of internal state. `max` and `current` then come
   * from the pool, `setMax` is a no-op (the pool owns its bounds), and a drop in the pool's value
   * between ticks is treated as damage for the purposes of the regen grace period.
   */
  pool?: RegenShieldPool;
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
  /**
   * Restart the regen grace period without changing the value — for damage the shield cannot see,
   * such as a hit that landed on health after the shield was already down, or damage routed through
   * a game's own effect pipeline.
   */
  noteDamage(): void;
  /** Advance time: count down the grace period, then regenerate once it has elapsed. */
  tick(dtSeconds: number, rates?: RegenShieldRates): void;
}

/**
 * Per-tick rate overrides, for games that derive regen from live state — a talent tree, a buff, an
 * equipped mod — rather than a constant fixed when the shield was built. Omit to use the configured
 * values; the grace period in effect is whichever `regenDelayMs` was last passed to `tick`.
 */
export interface RegenShieldRates {
  regenPerSecond?: number;
  regenDelayMs?: number;
}

/**
 * Builds a {@link RegenShield} that suppresses regen for `regenDelayMs` after each hit.
 *
 * @capability regen-shield a rechargeable overshield that absorbs damage and refills after a lull
 */
export function createRegenShield(config: RegenShieldConfig): RegenShield {
  const pool = config.pool;
  const regenPerSecond = Math.max(0, config.regenPerSecond);
  const regenDelayMs = Math.max(0, config.regenDelayMs);

  function clamp(value: number, ceiling: number): number {
    return Math.max(0, Math.min(ceiling, value));
  }

  let ownMax = Math.max(0, config.max);
  let ownCurrent = clamp(config.current ?? ownMax, ownMax);
  let sinceDamageMs = regenDelayMs;
  /** Grace period currently in force — the configured one until a `tick` overrides it. */
  let activeDelayMs = regenDelayMs;

  const readMax = (): number => (pool === undefined ? ownMax : Math.max(0, pool.max()));
  const readCurrent = (): number => (pool === undefined ? ownCurrent : clamp(pool.current(), readMax()));
  function write(value: number): void {
    const next = clamp(value, readMax());
    if (pool === undefined) ownCurrent = next;
    else pool.set(next);
  }

  /**
   * Last value this shield knows about, so a pool-backed shield can tell its own writes apart from
   * damage applied elsewhere. `null` until the first observation, so the first tick never reads a
   * cold start as a hit.
   */
  let observed: number | null = pool === undefined ? null : readCurrent();

  /** Detect an external decrease in a pool-backed value and restart the grace period if one happened. */
  function syncExternal(): void {
    if (pool === undefined) return;
    const live = readCurrent();
    if (observed !== null && live < observed) sinceDamageMs = 0;
    observed = live;
  }

  return {
    current: readCurrent,
    max: readMax,
    setMax(value) {
      // A pool owns its own bounds (an entity stat's max, a save record's cap); resizing it here
      // would silently disagree with whatever else writes that storage.
      if (pool !== undefined) return;
      ownMax = Math.max(0, value);
      ownCurrent = clamp(ownCurrent, ownMax);
    },
    fraction: () => (readMax() <= 0 ? 0 : readCurrent() / readMax()),
    isFull: () => readCurrent() >= readMax(),
    isBroken: () => readCurrent() <= 0,
    suppressed: () => sinceDamageMs < activeDelayMs,
    damage(amount) {
      if (amount <= 0) return 0;
      syncExternal();
      sinceDamageMs = 0;
      const live = readCurrent();
      const overflow = Math.max(0, amount - live);
      write(live - amount);
      observed = pool === undefined ? observed : readCurrent();
      return overflow;
    },
    restore(amount) {
      if (amount <= 0) return;
      syncExternal();
      write(readCurrent() + amount);
      observed = pool === undefined ? observed : readCurrent();
    },
    set(value) {
      write(value);
      observed = pool === undefined ? observed : readCurrent();
    },
    noteDamage() {
      syncExternal();
      sinceDamageMs = 0;
    },
    tick(dtSeconds, rates) {
      activeDelayMs = Math.max(0, rates?.regenDelayMs ?? regenDelayMs);
      if (dtSeconds <= 0) return;
      // Advance time first, THEN observe: damage that landed since the last tick resets the timer to
      // zero for this tick, so the tick that sees a hit never also regenerates over it.
      sinceDamageMs += dtSeconds * 1000;
      syncExternal();
      if (sinceDamageMs < activeDelayMs) return;
      write(readCurrent() + Math.max(0, rates?.regenPerSecond ?? regenPerSecond) * dtSeconds);
      observed = pool === undefined ? observed : readCurrent();
    },
  };
}
