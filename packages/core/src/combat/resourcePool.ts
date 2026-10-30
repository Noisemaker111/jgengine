import {
  changeStatPool,
  createStatPool,
  patchStatPool,
  statPoolFraction,
  type StatPool,
} from "../stats/statPool";

export interface ResourcePoolConfig {
  max: number;
  initial?: number;
  regenPerSecond?: number;
  decayPerSecond?: number;
}

/** Complete serializable state for a {@link ResourcePool}. */
export interface ResourcePoolSnapshot {
  current: number;
  max: number;
  regenPerSecond: number;
  decayPerSecond: number;
}

/** Runtime tuning patch for {@link ResourcePool.retune} — omitted fields keep their current value. */
export interface ResourcePoolRetune {
  max?: number;
  regenPerSecond?: number;
  decayPerSecond?: number;
}

export interface ResourcePool {
  current(): number;
  max(): number;
  setMax(value: number): void;
  fraction(): number;
  canSpend(amount: number): boolean;
  spend(amount: number): boolean;
  gain(amount: number): number;
  set(value: number): void;
  tick(dtSeconds: number): void;
  isFull(): boolean;
  isEmpty(): boolean;
  /** The whole pool as plain data — save it, ship it to a host, diff it in a test. */
  snapshot(): ResourcePoolSnapshot;
  /** Adopt a snapshot, replacing current value and tuning. */
  restore(state: ResourcePoolSnapshot): void;
  /** Change regen/decay/max mid-run (a buff, a difficulty change) without rebuilding the pool. */
  retune(patch: ResourcePoolRetune): void;
}

/**
 * A regenerating resource pool — mana, stamina, energy — that actions spend from and that refills over time.
 *
 * @capability resource-pool a regenerating pool like mana or stamina that actions spend from
 */
export function createResourcePool(config: ResourcePoolConfig): ResourcePool {
  let regenPerSecond = Math.max(0, config.regenPerSecond ?? 0);
  let decayPerSecond = Math.max(0, config.decayPerSecond ?? 0);
  let pool: StatPool = createStatPool({ current: config.initial, max: Math.max(0, config.max), min: 0 });

  return {
    current: () => pool.current,
    max: () => pool.max,
    setMax(value) {
      pool = patchStatPool(pool, { max: Math.max(0, value) });
    },
    fraction: () => statPoolFraction(pool),
    canSpend(amount) {
      return amount <= 0 || amount <= pool.current;
    },
    spend(amount) {
      if (amount <= 0) return true;
      if (amount > pool.current) return false;
      pool = changeStatPool(pool, -amount).pool;
      return true;
    },
    gain(amount) {
      if (amount > 0) pool = changeStatPool(pool, amount).pool;
      return pool.current;
    },
    set(value) {
      pool = patchStatPool(pool, { current: value });
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      pool = changeStatPool(pool, (regenPerSecond - decayPerSecond) * dtSeconds).pool;
    },
    isFull: () => pool.current >= pool.max,
    isEmpty: () => pool.current <= 0,
    snapshot: () => ({
      current: pool.current,
      max: pool.max,
      regenPerSecond,
      decayPerSecond,
    }),
    restore(state) {
      regenPerSecond = Math.max(0, state.regenPerSecond);
      decayPerSecond = Math.max(0, state.decayPerSecond);
      pool = createStatPool({ current: state.current, max: Math.max(0, state.max), min: 0 });
    },
    retune(patch) {
      if (patch.regenPerSecond !== undefined) regenPerSecond = Math.max(0, patch.regenPerSecond);
      if (patch.decayPerSecond !== undefined) decayPerSecond = Math.max(0, patch.decayPerSecond);
      if (patch.max !== undefined) pool = patchStatPool(pool, { max: Math.max(0, patch.max) });
    },
  };
}
