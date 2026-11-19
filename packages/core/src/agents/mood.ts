import { clamp } from "../math/scalar";
import type { NeedSet } from "../sim/needs";

/** One need's say in the mood score; weights are relative, so they need no fixed total. */
export interface MoodWeight {
  readonly need: string;
  readonly weight: number;
}

export interface MoodTier {
  readonly id: string;
  readonly label: string;
  readonly at: number;
}

export interface Mood {
  readonly score: number;
  readonly tier: string;
  readonly label: string;
}

export interface MoodSnapshot {
  sources: Record<string, number>;
}

/** @capability mood a mood derived from how satisfied an agent's needs are */
export function moodTierOf(score: number, tiers: readonly MoodTier[]): MoodTier {
  let lowest = tiers[0];
  if (lowest === undefined) throw new RangeError("A mood tier list needs at least one tier");
  // The highest tier the score reaches (the first of equals), as `tierAt` reads boundaries, without
  // building a boundary list per read.
  let best: MoodTier | null = null;
  for (const tier of tiers) {
    if (score >= tier.at && (best === null || tier.at > best.at)) best = tier;
    if (tier.at < lowest.at) lowest = tier;
  }
  return best ?? lowest;
}

/**
 * A mood read from a need set, on the caller's own tier list: each declared need contributes its
 * `0..1` satisfaction times its weight, normalized by the total weight, so an agent with four needs
 * and one with six read on the same 0-100 scale. Pure and allocation-light - the per-frame read a
 * HUD and a thought bubble share.
 *
 * @capability mood a mood derived from how satisfied an agent's needs are
 */
export function readMood(
  needs: Pick<NeedSet, "ids" | "fraction">,
  weights: readonly MoodWeight[],
  tiers: readonly MoodTier[],
  sources?: Readonly<Record<string, number>>,
): Mood {
  const score = moodScore(needs, weights, sources);
  const tier = moodTierOf(score, tiers);
  return { score, tier: tier.id, label: tier.label };
}

function moodScore(
  needs: Pick<NeedSet, "ids" | "fraction">,
  weights: readonly MoodWeight[],
  sources: Readonly<Record<string, number>> | undefined,
): number {
  let total = 0;
  let weighted = 0;
  const declared = needs.ids();
  for (const entry of weights) {
    if (!(entry.weight > 0) || declared.indexOf(entry.need) < 0) continue;
    const fraction = needs.fraction(entry.need);
    weighted += fraction * entry.weight;
    total += entry.weight;
  }
  const base = total > 0 ? weighted / total : 0;
  let bias = 0;
  if (sources !== undefined) for (const id in sources) bias += sources[id]!;
  return clamp(base * 100 + bias, 0, 100);
}

/** A mood reader that keeps the game-raised biases, so a queue or a litter patch moves mood too. */
export interface MoodReader {
  read(): Mood;
  setSource(id: string, value: number): void;
  clearSource(id: string): void;
  sources(): Readonly<Record<string, number>>;
  retune(patch: { readonly weights?: readonly MoodWeight[]; readonly tiers?: readonly MoodTier[] }): void;
  snapshot(): MoodSnapshot;
  restore(next: MoodSnapshot): void;
}

/** @capability mood a mood derived from how satisfied an agent's needs are */
export function createMoodReader(config: {
  readonly needs: Pick<NeedSet, "ids" | "fraction">;
  readonly weights?: readonly MoodWeight[];
  readonly tiers: readonly MoodTier[];
}): MoodReader {
  let weights: readonly MoodWeight[] =
    config.weights ??
    config.needs.ids().map((need) => ({ need, weight: 1 }));
  let tiers: readonly MoodTier[] = config.tiers;
  let sources: Record<string, number> = {};
  // A read that lands on the same score and tier as the last one returns that same record: an agent
  // reads its mood every tick, and it moves far more slowly than that.
  let last: Mood | null = null;

  return {
    read() {
      const score = moodScore(config.needs, weights, sources);
      const tier = moodTierOf(score, tiers);
      if (last === null || last.score !== score || last.tier !== tier.id || last.label !== tier.label) {
        last = { score, tier: tier.id, label: tier.label };
      }
      return last;
    },
    setSource(id, value) {
      if (!Number.isFinite(value) || value === 0) {
        const { [id]: _dropped, ...rest } = sources;
        sources = rest;
        return;
      }
      sources = { ...sources, [id]: value };
    },
    clearSource(id) {
      if (!(id in sources)) return;
      const { [id]: _dropped, ...rest } = sources;
      sources = rest;
    },
    sources: () => ({ ...sources }),
    retune(patch) {
      if (patch.weights !== undefined) weights = patch.weights;
      if (patch.tiers !== undefined) tiers = patch.tiers;
    },
    snapshot: () => ({ sources: { ...sources } }),
    restore(next) {
      const restored: Record<string, number> = {};
      for (const [id, value] of Object.entries(next.sources)) {
        if (Number.isFinite(value) && value !== 0) restored[id] = value;
      }
      sources = restored;
    },
  };
}
