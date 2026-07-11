export interface StatModifier {
  add?: number;
  multiply?: number;
}

export type StatModifierSet<TStat extends string> = Partial<Record<TStat, StatModifier>>;

export interface CreateStatsOptions {
  now?: () => number;
}

export interface Stats<TStat extends string> {
  setBase(stat: TStat, value: number): void;
  getBase(stat: TStat): number;
  addSource(sourceId: string, modifiers: StatModifierSet<TStat>, options?: { expiresAtMs?: number }): void;
  removeSource(sourceId: string): void;
  hasSource(sourceId: string, nowMs?: number): boolean;
  get(stat: TStat, nowMs?: number): number;
  pruneExpired(nowMs: number): string[];
  sources(): string[];
}

interface StatSourceEntry<TStat extends string> {
  modifiers: StatModifierSet<TStat>;
  expiresAtMs: number | undefined;
}

export function createStats<TStat extends string>(
  base: Record<TStat, number>,
  options?: CreateStatsOptions,
): Stats<TStat> {
  const baseValues: Record<TStat, number> = { ...base };
  const sourceEntries = new Map<string, StatSourceEntry<TStat>>();
  const clock = options?.now;

  function resolveNow(nowMs: number | undefined): number | undefined {
    return nowMs ?? clock?.();
  }

  function isExpired(entry: StatSourceEntry<TStat>, nowMs: number | undefined): boolean {
    return nowMs !== undefined && entry.expiresAtMs !== undefined && entry.expiresAtMs <= nowMs;
  }

  function dropExpired(nowMs: number): string[] {
    const pruned: string[] = [];
    for (const [sourceId, entry] of sourceEntries) {
      if (isExpired(entry, nowMs)) {
        sourceEntries.delete(sourceId);
        pruned.push(sourceId);
      }
    }
    return pruned;
  }

  function resolve(stat: TStat, nowMs: number | undefined): number {
    let total = baseValues[stat];
    let multiplier = 1;

    for (const entry of sourceEntries.values()) {
      if (isExpired(entry, nowMs)) continue;
      const modifier = entry.modifiers[stat];
      if (!modifier) continue;
      if (modifier.add !== undefined) total += modifier.add;
      if (modifier.multiply !== undefined) multiplier *= modifier.multiply;
    }

    return total * multiplier;
  }

  return {
    setBase(stat, value) {
      baseValues[stat] = value;
    },
    getBase(stat) {
      return baseValues[stat];
    },
    addSource(sourceId, modifiers, sourceOptions) {
      sourceEntries.set(sourceId, { modifiers, expiresAtMs: sourceOptions?.expiresAtMs });
    },
    removeSource(sourceId) {
      sourceEntries.delete(sourceId);
    },
    hasSource(sourceId, nowMs) {
      const entry = sourceEntries.get(sourceId);
      if (entry === undefined) return false;
      const time = resolveNow(nowMs);
      if (isExpired(entry, time)) {
        sourceEntries.delete(sourceId);
        return false;
      }
      return true;
    },
    get(stat, nowMs) {
      const time = resolveNow(nowMs);
      if (time !== undefined) dropExpired(time);
      return resolve(stat, time);
    },
    pruneExpired(nowMs) {
      return dropExpired(nowMs);
    },
    sources() {
      return Array.from(sourceEntries.keys());
    },
  };
}
