export interface ResourcePoolConfig {
  max: number;
  initial?: number;
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
}

/**
 * A regenerating resource pool — mana, stamina, energy — that actions spend from and that refills over time.
 *
 * @capability resource-pool a regenerating pool like mana or stamina that actions spend from
 */
export function createResourcePool(config: ResourcePoolConfig): ResourcePool {
  let max = Math.max(0, config.max);
  const regenPerSecond = Math.max(0, config.regenPerSecond ?? 0);
  const decayPerSecond = Math.max(0, config.decayPerSecond ?? 0);
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
  };
}
