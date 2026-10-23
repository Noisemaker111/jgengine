import { clamp } from "../math/scalar";
import type { NeedSet } from "../sim/needs";

/** One need's say in the mood score; weights are relative, so they need no fixed total. */
export interface MoodWeight {
  /** Declared need id on the agent's need set; unknown ids are ignored. */
  readonly need: string;
  readonly weight: number;
}

/** One labelled band of the 0-100 mood score. */
export interface MoodTier {
  readonly id: string;
  readonly label: string;
  /** Lowest score that reads as this tier. */
  readonly at: number;
}

/** What the agent feels right now, on the caller's own tier labels. */
export interface Mood {
  /** 0 (nothing satisfied) . 100 (everything satisfied), plus any live source. */
  readonly score: number;
  readonly tier: string;
  readonly label: string;
}

/**
 * Five bands a park guest, a household being or a soldier can share. A game overrides them when its
 * own tone needs different words; the numeric bands are what HUD counters and tests read.
 */
export const DEFAULT_MOOD_TIERS: readonly MoodTier[] = [
  { at: 82, id: "radiant", label: "Radiant" },
  { at: 64, id: "content", label: "Content" },
  { at: 45, id: "fine", label: "Fine" },
  { at: 26, id: "glum", label: "Glum" },
  { at: 0, id: "low", label: "Low" },
];

/** Serializable mood state: the game-raised biases that sit on top of need satisfaction. */
export interface MoodSnapshot {
  sources: Record<string, number>;
}

/**
 * The band a score reads as, from tiers sorted by `at` descending. Unknown or unsorted tiers fall
 * back to the lowest declared band rather than throwing, because a HUD reads this every frame.
 */
export function moodTierOf(score: number, tiers: readonly MoodTier[] = DEFAULT_MOOD_TIERS): MoodTier {
  let best: MoodTier | null = null;
  for (const tier of tiers) if (score >= tier.at && (best === null || tier.at > best.at)) best = tier;
  return best ?? tiers[tiers.length - 1] ?? { at: 0, id: "low", label: "Low" };
}

/**
 * A mood read from a need set: each declared need contributes its `0..1` satisfaction times its
 * weight, normalized by the total weight, so an agent with four needs and one with six read on the
 * same 0-100 scale. Pure and allocation-light - the per-frame read a HUD and a thought bubble share.
 *
 * @capability mood a mood derived from how satisfied an agent's needs are
 */
export function readMood(
  needs: Pick<NeedSet, "ids" | "fraction">,
  weights: readonly MoodWeight[],
  tiers: readonly MoodTier[] = DEFAULT_MOOD_TIERS,
  sources?: Readonly<Record<string, number>>,
): Mood {
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
  if (sources !== undefined) for (const value of Object.values(sources)) bias += value;
  const score = clamp(base * 100 + bias, 0, 100);
  const tier = moodTierOf(score, tiers);
  return { score, tier: tier.id, label: tier.label };
}

/** A mood reader that keeps the game-raised biases, so a queue or a litter patch moves mood too. */
export interface MoodReader {
  /** Current mood: need satisfaction plus every live source. */
  read(): Mood;
  /** Raise (or lower, with a negative) one named bias; calling again replaces that source. */
  setSource(id: string, value: number): void;
  /** Drop one bias - the queue emptied, the litter was cleaned. */
  clearSource(id: string): void;
  /** Every live bias, for a debug line or a panel. */
  sources(): Readonly<Record<string, number>>;
  /** Replace the weights and tiers in play, keeping the biases. */
  retune(patch: { readonly weights?: readonly MoodWeight[]; readonly tiers?: readonly MoodTier[] }): void;
  snapshot(): MoodSnapshot;
  restore(next: MoodSnapshot): void;
}

/**
 * Create the mood an agent carries. Needs are the agent's own (shared with its utility brain), and
 * every bias is named data the game can remove again - there is no decaying hidden penalty.
 *
 * @capability mood a mood derived from how satisfied an agent's needs are
 */
export function createMoodReader(config: {
  readonly needs: Pick<NeedSet, "ids" | "fraction">;
  readonly weights?: readonly MoodWeight[];
  readonly tiers?: readonly MoodTier[];
}): MoodReader {
  let weights: readonly MoodWeight[] =
    config.weights ??
    config.needs.ids().map((need) => ({ need, weight: 1 }));
  let tiers: readonly MoodTier[] = config.tiers ?? DEFAULT_MOOD_TIERS;
  let sources: Record<string, number> = {};

  return {
    read: () => readMood(config.needs, weights, tiers, sources),
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
