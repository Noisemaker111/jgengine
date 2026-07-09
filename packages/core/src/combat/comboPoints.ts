export interface ComboPointsConfig {
  max: number;
  expireAfterSeconds?: number;
}

export interface ComboPoints {
  points(): number;
  gain(amount?: number): number;
  spend(amount: number): boolean;
  spendAll(): number;
  tick(dtSeconds: number): void;
  expiresIn(): number | null;
  clear(): void;
}

export function createComboPoints(config: ComboPointsConfig): ComboPoints {
  const max = config.max;
  const expireAfterSeconds = config.expireAfterSeconds;
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
    clear() {
      current = 0;
      remaining = null;
    },
  };
}
