import {
  createStatGraph,
  statModifierContributions,
  type StatGraph,
  type StatSheet,
} from "../progression/statGraph";

export interface StatModifier {
  add?: number;
  multiply?: number;
}

export type StatModifierSet<TStat extends string> = Partial<Record<TStat, StatModifier>>;

export interface CreateStatsOptions {
  now?: () => number;
}

/** One serializable modifier source in a {@link StatsSnapshot}. */
interface StatModifierSourceSnapshot<TStat extends string> {
  id: string;
  modifiers: StatModifierSet<TStat>;
  expiresAtMs?: number;
}

/** Complete plain-data state for a {@link Stats} runtime. */
export interface StatsSnapshot<TStat extends string> {
  base: Record<TStat, number>;
  sources: StatModifierSourceSnapshot<TStat>[];
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
  /** Return a detached JSON-serializable copy of base values and modifier sources. */
  snapshot(): StatsSnapshot<TStat>;
  /** Replace all runtime state from caller-owned decoded snapshot data. */
  restore(snapshot: StatsSnapshot<TStat>): void;
}

interface StatSourceEntry<TStat extends string> {
  modifiers: StatModifierSet<TStat>;
  expiresAtMs: number | undefined;
}

function cloneModifierSet<TStat extends string>(modifiers: StatModifierSet<TStat>): StatModifierSet<TStat> {
  const copy: StatModifierSet<TStat> = {};
  for (const stat of Object.keys(modifiers) as TStat[]) {
    const modifier = modifiers[stat];
    if (modifier !== undefined) copy[stat] = { ...modifier };
  }
  return copy;
}

/**
 * A stat block whose base values take stacking, timed buffs and debuffs, resolving the modified value on read.
 *
 * @capability stat-block base stats with stacking, expiring buffs and debuffs applied on read
 */
export function createStats<TStat extends string>(
  base: Record<TStat, number>,
  options?: CreateStatsOptions,
): Stats<TStat> {
  const clock = options?.now;
  let baseValues: Record<TStat, number> = { ...base };
  const sourceEntries = new Map<string, StatSourceEntry<TStat>>();
  /** Every stat id the graph knows: base values plus whatever a modifier source names. */
  const statIds = new Set<string>(Object.keys(baseValues));
  let sheet: StatSheet = emptySheet();

  /** A sheet over every stat any base value or modifier source names. */
  function emptySheet(): StatSheet {
    const graph: StatGraph = createStatGraph({ inputs: [...statIds].map((id) => ({ id })) });
    const created = graph.create(baseValues);
    for (const [sourceId, entry] of sourceEntries) {
      created.addSource(sourceId, statModifierContributions(sourceId, entry.modifiers));
    }
    return created;
  }

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
        sheet.removeSource(sourceId);
        pruned.push(sourceId);
      }
    }
    return pruned;
  }

  return {
    setBase(stat, value) {
      baseValues = { ...baseValues, [stat]: value };
      if (statIds.has(stat)) sheet.setBase(stat, value);
      else {
        statIds.add(stat);
        sheet = emptySheet();
      }
    },
    getBase(stat) {
      return baseValues[stat];
    },
    addSource(sourceId, modifiers, sourceOptions) {
      sourceEntries.set(sourceId, { modifiers, expiresAtMs: sourceOptions?.expiresAtMs });
      let announced = false;
      for (const stat of Object.keys(modifiers)) {
        if (statIds.has(stat)) continue;
        statIds.add(stat);
        announced = true;
      }
      // A source that names a new stat widens the graph's vocabulary; otherwise the sheet takes it as is.
      if (announced) sheet = emptySheet();
      else sheet.addSource(sourceId, statModifierContributions(sourceId, modifiers));
    },
    removeSource(sourceId) {
      sourceEntries.delete(sourceId);
      sheet.removeSource(sourceId);
    },
    hasSource(sourceId, nowMs) {
      const entry = sourceEntries.get(sourceId);
      if (entry === undefined) return false;
      const time = resolveNow(nowMs);
      if (isExpired(entry, time)) {
        sourceEntries.delete(sourceId);
        sheet.removeSource(sourceId);
        return false;
      }
      return true;
    },
    get(stat, nowMs) {
      const time = resolveNow(nowMs);
      if (time !== undefined) dropExpired(time);
      // A stat the block has never seen reads as NaN, as it always has; adding a base or a source names it.
      if (!statIds.has(stat)) return Number.NaN;
      return sheet.get(stat);
    },
    pruneExpired(nowMs) {
      return dropExpired(nowMs);
    },
    sources() {
      return Array.from(sourceEntries.keys());
    },
    snapshot() {
      return {
        base: { ...baseValues },
        sources: Array.from(sourceEntries, ([id, entry]) => ({
          id,
          modifiers: cloneModifierSet(entry.modifiers),
          ...(entry.expiresAtMs === undefined ? {} : { expiresAtMs: entry.expiresAtMs }),
        })),
      };
    },
    restore(snapshot) {
      baseValues = { ...snapshot.base };
      sourceEntries.clear();
      statIds.clear();
      for (const id of Object.keys(baseValues)) statIds.add(id);
      for (const source of snapshot.sources) {
        sourceEntries.set(source.id, {
          modifiers: cloneModifierSet(source.modifiers),
          expiresAtMs: source.expiresAtMs,
        });
        for (const stat of Object.keys(source.modifiers)) statIds.add(stat);
      }
      sheet = emptySheet();
    },
  };
}
