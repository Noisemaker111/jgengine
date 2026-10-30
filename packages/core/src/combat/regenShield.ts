import {
  changeStatPool,
  createStatPool,
  patchStatPool,
  statPoolFraction,
  type StatPool,
} from "../stats/statPool";

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

/** Complete mutable shield state, including pending external damage detection. */
export interface RegenShieldState {
  max: number;
  current: number;
  sinceDamageMs: number;
  activeDelayMs: number;
  observed: number | null;
}

/**
 * A shield pool that stops regenerating for `regenDelayMs` after every hit, then refills at
 * `regenPerSecond` — the delayed-regen primitive that replaces snapshot-comparing stat values per
 * tick to detect "damage taken" (#536.3). `damage` resets the grace timer; `tick` counts it down and
 * regenerates once it elapses.
 */
export interface RegenShield {
  /** Detached pool value, bounds, and regen timing. */
  state(): RegenShieldState;
  /** Restore state; returns false without mutation when an external pool's max differs. */
  restore(next: RegenShieldState): boolean;
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
  refill(amount: number): void;
  /** @deprecated Use `refill(amount)` for pickups; `restore(state)` loads persisted state. */
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
  const port = config.pool;
  const baseRegenPerSecond = Math.max(0, config.regenPerSecond);
  const baseDelayMs = Math.max(0, config.regenDelayMs);
  let activeDelayMs = baseDelayMs;
  /** Grace clock in milliseconds, so a save round-trips the exact remaining delay. */
  let sinceDamageMs = baseDelayMs;
  let ownPool: StatPool = createStatPool({ current: config.current, max: Math.max(0, config.max), min: 0 });

  function readPool(): StatPool {
    if (port === undefined) return ownPool;
    return createStatPool({ current: port.current(), max: Math.max(0, port.max()), min: 0 });
  }

  function readCurrent(): number {
    return readPool().current;
  }

  function readMax(): number {
    return readPool().max;
  }

  /** Adopt a computed pool, writing through the port when the shield does not own the value. */
  function write(pool: StatPool): void {
    if (port === undefined) ownPool = pool;
    else port.set(pool.current);
  }

  let observed: number | null = port === undefined ? null : readCurrent();

  function observe(): void {
    if (port !== undefined) observed = readCurrent();
  }

  /** Detect an external decrease in a pool-backed value and restart the grace period if one happened. */
  function syncExternal(): void {
    if (port === undefined) return;
    const live = readCurrent();
    if (observed !== null && live < observed) sinceDamageMs = 0;
    observed = live;
  }

  function refill(amount: number): void {
    if (amount <= 0) return;
    syncExternal();
    write(changeStatPool(readPool(), amount).pool);
    observe();
  }

  function restore(next: RegenShieldState): boolean;
  function restore(amount: number): void;
  function restore(next: RegenShieldState | number): boolean | void {
    if (typeof next === "number") return refill(next);
    if (port !== undefined && readMax() !== next.max) return false;
    if (port === undefined) ownPool = createStatPool({ current: next.current, max: Math.max(0, next.max), min: 0 });
    else write(createStatPool({ current: next.current, max: readMax(), min: 0 }));
    sinceDamageMs = Math.max(0, next.sinceDamageMs);
    activeDelayMs = Math.max(0, next.activeDelayMs);
    observed = port === undefined ? null : next.observed;
    return true;
  }

  return {
    state: () => ({
      max: readMax(),
      current: readCurrent(),
      sinceDamageMs,
      activeDelayMs,
      observed,
    }),
    restore,
    refill,
    current: readCurrent,
    max: readMax,
    setMax(value) {
      // A pool owns its own bounds (an entity stat's max, a save record's cap); resizing it here
      // would silently disagree with whatever else writes that storage.
      if (port !== undefined) return;
      ownPool = patchStatPool(ownPool, { max: Math.max(0, value) });
    },
    fraction: () => statPoolFraction(readPool()),
    isFull: () => readCurrent() >= readMax(),
    isBroken: () => readCurrent() <= 0,
    suppressed: () => sinceDamageMs < activeDelayMs,
    damage(amount) {
      if (amount <= 0) return 0;
      syncExternal();
      const pool = readPool();
      const overflow = Math.max(0, amount - pool.current);
      write(changeStatPool(pool, -amount).pool);
      sinceDamageMs = 0;
      observe();
      return overflow;
    },
    set(value) {
      write(createStatPool({ current: value, max: readMax(), min: 0 }));
      observe();
    },
    noteDamage() {
      syncExternal();
      sinceDamageMs = 0;
    },
    tick(dtSeconds, rates) {
      activeDelayMs = Math.max(0, rates?.regenDelayMs ?? baseDelayMs);
      if (dtSeconds <= 0) return;
      // Advance time first, THEN observe: damage that landed since the last tick resets the timer to
      // zero for this tick, so the tick that sees a hit never also regenerates over it.
      sinceDamageMs += dtSeconds * 1000;
      syncExternal();
      if (sinceDamageMs < activeDelayMs) return;
      write(changeStatPool(readPool(), Math.max(0, rates?.regenPerSecond ?? baseRegenPerSecond) * dtSeconds).pool);
      observe();
    },
  };
}
