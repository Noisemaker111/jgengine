export interface ThreatTableConfig {
  decayPerSecond?: number;
  max?: number;
  forgetBelow?: number;
}

export interface ThreatEntry {
  sourceId: string;
  threat: number;
}

export interface HighestThreatOptions {
  current?: string | null;
  stickiness?: number;
}

export interface ThreatTable {
  add(sourceId: string, amount: number): number;
  set(sourceId: string, amount: number): void;
  threatOf(sourceId: string): number;
  decay(dt: number): void;
  highest(options?: HighestThreatOptions): string | null;
  ranked(): ThreatEntry[];
  remove(sourceId: string): void;
  clear(): void;
  size(): number;
}

const DEFAULT_FORGET_BELOW = 0;

export function createThreatTable(config: ThreatTableConfig = {}): ThreatTable {
  const decayPerSecond = Math.max(0, config.decayPerSecond ?? 0);
  const max = config.max ?? Number.POSITIVE_INFINITY;
  const forgetBelow = config.forgetBelow ?? DEFAULT_FORGET_BELOW;
  const table = new Map<string, number>();

  function store(sourceId: string, value: number): number {
    const clamped = Math.min(max, value);
    if (clamped <= forgetBelow) {
      table.delete(sourceId);
      return 0;
    }
    table.set(sourceId, clamped);
    return clamped;
  }

  return {
    add(sourceId, amount) {
      return store(sourceId, (table.get(sourceId) ?? 0) + amount);
    },
    set(sourceId, amount) {
      store(sourceId, amount);
    },
    threatOf(sourceId) {
      return table.get(sourceId) ?? 0;
    },
    decay(dt) {
      if (decayPerSecond <= 0 || dt <= 0) return;
      const loss = decayPerSecond * dt;
      for (const [sourceId, value] of [...table]) store(sourceId, value - loss);
    },
    highest(options = {}) {
      let bestId: string | null = null;
      let bestThreat = Number.NEGATIVE_INFINITY;
      for (const [sourceId, value] of table) {
        if (value > bestThreat) {
          bestThreat = value;
          bestId = sourceId;
        }
      }
      if (bestId === null) return null;
      const current = options.current ?? null;
      if (current !== null && current !== bestId && table.has(current)) {
        const stickiness = options.stickiness ?? 1;
        if (bestThreat < table.get(current)! * stickiness) return current;
      }
      return bestId;
    },
    ranked() {
      return [...table]
        .map(([sourceId, threat]) => ({ sourceId, threat }))
        .sort((a, b) => b.threat - a.threat || a.sourceId.localeCompare(b.sourceId));
    },
    remove(sourceId) {
      table.delete(sourceId);
    },
    clear() {
      table.clear();
    },
    size() {
      return table.size;
    },
  };
}
