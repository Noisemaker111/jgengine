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
  taunt(sourceId: string, durationSeconds: number): void;
  forcedTarget(): string | null;
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
  let forcedSource: string | null = null;
  let forcedRemaining = 0;

  function store(sourceId: string, value: number): number {
    const clamped = Math.min(max, value);
    if (clamped <= forgetBelow) {
      table.delete(sourceId);
      return 0;
    }
    table.set(sourceId, clamped);
    return clamped;
  }

  function topThreat(): number {
    let best = 0;
    for (const value of table.values()) if (value > best) best = value;
    return best;
  }

  function forcedTarget(): string | null {
    return forcedRemaining > 0 ? forcedSource : null;
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
      if (dt > 0 && forcedRemaining > 0) {
        forcedRemaining -= dt;
        if (forcedRemaining <= 0) {
          forcedRemaining = 0;
          forcedSource = null;
        }
      }
      if (decayPerSecond <= 0 || dt <= 0) return;
      const loss = decayPerSecond * dt;
      for (const [sourceId, value] of [...table]) store(sourceId, value - loss);
    },
    highest(options = {}) {
      const forced = forcedTarget();
      if (forced !== null) return forced;
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
    taunt(sourceId, durationSeconds) {
      store(sourceId, Math.max(table.get(sourceId) ?? 0, topThreat()));
      forcedSource = sourceId;
      forcedRemaining = Math.max(0, durationSeconds);
    },
    forcedTarget,
    remove(sourceId) {
      table.delete(sourceId);
      if (forcedSource === sourceId) {
        forcedSource = null;
        forcedRemaining = 0;
      }
    },
    clear() {
      table.clear();
      forcedSource = null;
      forcedRemaining = 0;
    },
    size() {
      return table.size;
    },
  };
}
