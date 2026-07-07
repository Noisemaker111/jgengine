import { pickWeighted } from "../world/scatterItems";
import type { StatModifier, StatModifierSet, Stats } from "../stats/statModifiers";

export interface RunModifierOffer<TStat extends string = string, TData = unknown> {
  id: string;
  weight: number;
  maxStacks?: number;
  label?: string;
  stats?: StatModifierSet<TStat>;
  data?: TData;
}

export interface RunModifierPick {
  id: string;
  stacks: number;
}

export interface RunModifierStack<TStat extends string = string, TData = unknown> {
  add(offerId: string): boolean;
  count(offerId: string): number;
  atMax(offerId: string): boolean;
  picks(): RunModifierPick[];
  offer(offerId: string): RunModifierOffer<TStat, TData> | null;
  total(stat: TStat): StatModifier;
  apply(stats: Stats<TStat>, sourceId?: string): void;
  clear(): void;
}

export function createRunModifierStack<TStat extends string = string, TData = unknown>(
  offers: readonly RunModifierOffer<TStat, TData>[],
): RunModifierStack<TStat, TData> {
  const byId = new Map<string, RunModifierOffer<TStat, TData>>();
  for (const offer of offers) {
    if (byId.has(offer.id)) throw new Error(`duplicate run modifier offer: ${offer.id}`);
    byId.set(offer.id, offer);
  }
  const stacks = new Map<string, number>();

  function count(offerId: string): number {
    return stacks.get(offerId) ?? 0;
  }
  function atMax(offerId: string): boolean {
    const offer = byId.get(offerId);
    if (offer === undefined) return true;
    return offer.maxStacks !== undefined && count(offerId) >= offer.maxStacks;
  }

  function total(stat: TStat): StatModifier {
    let add = 0;
    let multiply = 1;
    for (const [offerId, n] of stacks) {
      const modifier = byId.get(offerId)?.stats?.[stat];
      if (modifier === undefined) continue;
      if (modifier.add !== undefined) add += modifier.add * n;
      if (modifier.multiply !== undefined) multiply *= Math.pow(modifier.multiply, n);
    }
    return { add, multiply };
  }

  function statKeys(): TStat[] {
    const keys = new Set<TStat>();
    for (const offerId of stacks.keys()) {
      const stat = byId.get(offerId)?.stats;
      if (stat === undefined) continue;
      for (const key of Object.keys(stat) as TStat[]) keys.add(key);
    }
    return [...keys];
  }

  return {
    add(offerId) {
      if (!byId.has(offerId) || atMax(offerId)) return false;
      stacks.set(offerId, count(offerId) + 1);
      return true;
    },
    count,
    atMax,
    picks() {
      return [...stacks.entries()].map(([id, s]) => ({ id, stacks: s }));
    },
    offer(offerId) {
      return byId.get(offerId) ?? null;
    },
    total,
    apply(stats, sourceId = "run-modifiers") {
      const set: StatModifierSet<TStat> = {};
      for (const key of statKeys()) set[key] = total(key);
      stats.addSource(sourceId, set);
    },
    clear() {
      stacks.clear();
    },
  };
}

export interface RunDraftConfig<TStat extends string = string, TData = unknown> {
  offers: readonly RunModifierOffer<TStat, TData>[];
  rng?: () => number;
}

export interface RunDraft<TStat extends string = string, TData = unknown> {
  present(count: number, rng?: () => number): RunModifierOffer<TStat, TData>[];
  choose(offerId: string): boolean;
  stack(): RunModifierStack<TStat, TData>;
}

export function createRunDraft<TStat extends string = string, TData = unknown>(
  config: RunDraftConfig<TStat, TData>,
): RunDraft<TStat, TData> {
  const stack = createRunModifierStack<TStat, TData>(config.offers);
  const defaultRng = config.rng ?? Math.random;

  return {
    present(count, rng = defaultRng) {
      const pool = config.offers.filter((offer) => !stack.atMax(offer.id));
      const remaining = pool.map((offer) => ({ value: offer, weight: offer.weight }));
      const drawn: RunModifierOffer<TStat, TData>[] = [];
      while (drawn.length < count && remaining.length > 0) {
        const picked = pickWeighted(remaining, rng());
        if (picked === null) break;
        drawn.push(picked);
        const index = remaining.findIndex((entry) => entry.value.id === picked.id);
        if (index >= 0) remaining.splice(index, 1);
      }
      return drawn;
    },
    choose(offerId) {
      return stack.add(offerId);
    },
    stack() {
      return stack;
    },
  };
}
