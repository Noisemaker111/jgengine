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
  let max = Math.max(0, config.max);
  let regenPerSecond = Math.max(0, config.regenPerSecond ?? 0);
  let decayPerSecond = Math.max(0, config.decayPerSecond ?? 0);
  let current = clamp(config.initial ?? max, max);

  function clamp(value: number, ceiling: number): number {
    return Math.max(0, Math.min(ceiling, value));
  }

  return {
    current() {
      return current;
    },
    max() {
      return max;
    },
    setMax(value) {
      max = Math.max(0, value);
      current = clamp(current, max);
    },
    fraction() {
      return max <= 0 ? 0 : current / max;
    },
    canSpend(amount) {
      return amount <= 0 || amount <= current;
    },
    spend(amount) {
      if (amount <= 0) return true;
      if (amount > current) return false;
      current = clamp(current - amount, max);
      return true;
    },
    gain(amount) {
      if (amount > 0) current = clamp(current + amount, max);
      return current;
    },
    set(value) {
      current = clamp(value, max);
    },
    tick(dtSeconds) {
      if (dtSeconds <= 0) return;
      const net = (regenPerSecond - decayPerSecond) * dtSeconds;
      current = clamp(current + net, max);
    },
    isFull() {
      return current >= max;
    },
    isEmpty() {
      return current <= 0;
    },
    snapshot() {
      return { current, max, regenPerSecond, decayPerSecond };
    },
    restore(state) {
      max = Math.max(0, state.max);
      regenPerSecond = Math.max(0, state.regenPerSecond);
      decayPerSecond = Math.max(0, state.decayPerSecond);
      current = clamp(state.current, max);
    },
    retune(patch) {
      if (patch.max !== undefined) max = Math.max(0, patch.max);
      if (patch.regenPerSecond !== undefined) regenPerSecond = Math.max(0, patch.regenPerSecond);
      if (patch.decayPerSecond !== undefined) decayPerSecond = Math.max(0, patch.decayPerSecond);
      current = clamp(current, max);
    },
  };
}
