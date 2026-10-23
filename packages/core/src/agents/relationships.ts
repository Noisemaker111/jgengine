import { clamp } from "../math/scalar";
import { createPairKeyCodec } from "../relation/keyedValues";
import { crossThresholds, type ThresholdBoundary } from "../relation/thresholds";

/** One labelled bond level on the opinion scale. */
export interface RelationshipMilestone {
  readonly id: string;
  readonly label: string;
  /** Opinion at which the pair reaches this level. */
  readonly at: number;
  /** Familiarity the pair also needs; a bond wants time shared, not one good afternoon. */
  readonly requiresFamiliarity?: number;
}

/** The pair levels every game starts from; a game overrides the words and the cut points. */
export const DEFAULT_RELATIONSHIP_MILESTONES: readonly RelationshipMilestone[] = [
  { id: "friends", label: "Friends", at: 35 },
  { id: "close", label: "Close", at: 70 },
  { id: "bonded", label: "Bonded", at: 95, requiresFamiliarity: 0.5 },
];

/** How one pair stands: how much time they have shared, and what they think of each other. */
export interface Relationship {
  /** 0 (strangers) . 1 (they know each other well). */
  readonly familiarity: number;
  /** The game's opinion scale, default -100 (rivals) . 100 (inseparable). */
  readonly opinion: number;
}

/** Tunables a game owns, every one reachable through {@link RelationshipBook.retune}. */
export interface RelationshipPolicy {
  readonly opinionMin?: number;
  readonly opinionMax?: number;
  readonly familiarityMax?: number;
  readonly milestones?: readonly RelationshipMilestone[];
}

/** Opinion and familiarity one interaction adds; a game passes its own for a hug, a row or a shift. */
export interface SocialContact {
  readonly familiarity?: number;
  readonly opinion?: number;
}

/** What one social action did to a pair. */
export interface SocialOutcome {
  readonly a: string;
  readonly b: string;
  readonly before: Relationship;
  readonly after: Relationship;
  /** Milestones newly crossed upward, lowest first - what a notice feed or a journal line reads. */
  readonly crossed: readonly RelationshipMilestone[];
}

/** Serializable relationship state: every known pair plus the dials in play. */
export interface RelationshipBookSnapshot {
  pairs: Record<string, Relationship>;
  policy: RelationshipPolicy;
}

/** What a plain social action adds: a shared moment nudges both dials, never maxes either. */
export const DEFAULT_SOCIAL_CONTACT: Required<SocialContact> = { familiarity: 0.08, opinion: 4 };

/**
 * Everyone's view of everyone else: familiarity and opinion per pair, changed by social actions,
 * with the pair levels that make a friendship a preference and a bond a refusal to split.
 *
 * One book serves a whole world (a park, a household, a squad). Pairs are undirected, so
 * `opinion(a, b) === opinion(b, a)` and one interaction is enough for both sides.
 */
export interface RelationshipBook {
  /** How a pair stands; strangers read as `familiarity 0, opinion 0`. */
  get(a: string, b: string): Relationship;
  familiarity(a: string, b: string): number;
  opinion(a: string, b: string): number;
  /**
   * Record one interaction between two agents. Defaults add a small amount of familiarity and
   * opinion; a game passes a larger or negative contact for a row or a rescue. An agent's own id is
   * ignored, so a wide query that includes the actor cannot self-bond.
   */
  socialise(a: string, b: string, contact?: SocialContact): SocialOutcome;
  /** The highest milestone a pair has reached, or `null` for strangers. */
  milestone(a: string, b: string): RelationshipMilestone | null;
  /** Id of the highest milestone reached, or `null`. */
  label(a: string, b: string): string | null;
  friends(a: string, b: string): boolean;
  /** A bonded pair. */
  bonded(a: string, b: string): boolean;
  /** The strongest bonded partner of `a`, or `null`. A tie keeps the first pair recorded. */
  bondedWith(a: string): string | null;
  /** Friends or closer - the pair prefers each other's company when both are free. */
  prefersCompanyOf(a: string, b: string): boolean;
  /** WHY: the rule that keeps a couple from being posted to opposite shifts is an opinion threshold, not a flag. */
  refusesToSplit(a: string, b: string): boolean;
  /** Every agent this one has shared anything with, sorted by id. Allocates - UI and tests. */
  partnersOf(a: string): readonly string[];
  policy(): Required<RelationshipPolicy>;
  retune(patch: RelationshipPolicy): void;
  snapshot(): RelationshipBookSnapshot;
  restore(next: RelationshipBookSnapshot): void;
}

const DEFAULTS: Required<RelationshipPolicy> = {
  opinionMin: -100,
  opinionMax: 100,
  familiarityMax: 1,
  milestones: DEFAULT_RELATIONSHIP_MILESTONES,
};

/**
 * Create the shared book of pair state. Keys are undirected and delimiter-safe through
 * `createPairKeyCodec`, and milestone crossings come from `crossThresholds`, so a notice feed and a
 * journal both read the same event.
 *
 * @capability relationships familiarity and opinion between agents, with a bond that changes behaviour
 */
export function createRelationshipBook(policy: RelationshipPolicy = {}): RelationshipBook {
  let current: Required<RelationshipPolicy> = { ...DEFAULTS, ...policy };
  const codec = createPairKeyCodec();
  let pairs = new Map<string, Relationship>();

  const pairKey = (a: string, b: string): string => codec.key(a, b);
  const read = (a: string, b: string): Relationship => pairs.get(pairKey(a, b)) ?? { familiarity: 0, opinion: 0 };

  const boundaries = (): ThresholdBoundary<RelationshipMilestone>[] =>
    current.milestones.map((milestone) => ({ id: milestone, at: milestone.at }));

  const gate = (milestone: RelationshipMilestone, pair: Relationship): boolean =>
    pair.familiarity >= (milestone.requiresFamiliarity ?? 0);

  const reached = (pair: Relationship): RelationshipMilestone | null => {
    let best: RelationshipMilestone | null = null;
    for (const milestone of current.milestones) {
      if (pair.opinion < milestone.at || !gate(milestone, pair)) continue;
      if (best === null || milestone.at > best.at) best = milestone;
    }
    return best;
  };

  return {
    get: read,
    familiarity: (a, b) => read(a, b).familiarity,
    opinion: (a, b) => read(a, b).opinion,
    socialise(a, b, contact = DEFAULT_SOCIAL_CONTACT) {
      const before = read(a, b);
      if (a === b) return { a, b, before, after: before, crossed: [] };
      const familiarityDelta = contact.familiarity ?? 0;
      const opinionDelta = contact.opinion ?? 0;
      const after: Relationship = {
        familiarity: clamp(before.familiarity + familiarityDelta, 0, current.familiarityMax),
        opinion: clamp(before.opinion + opinionDelta, current.opinionMin, current.opinionMax),
      };
      pairs.set(pairKey(a, b), after);
      const crossed = crossThresholds(boundaries(), before.opinion, after.opinion)
        .filter((crossing) => crossing.direction === "up")
        .map((crossing) => crossing.id)
        .filter((milestone) => gate(milestone, after));
      return { a, b, before, after, crossed };
    },
    milestone: (a, b) => reached(read(a, b)),
    label: (a, b) => (a === b ? null : reached(read(a, b))?.id ?? null),
    friends(a, b) {
      if (a === b) return false;
      return reached(read(a, b)) !== null;
    },
    bonded(a, b) {
      if (a === b) return false;
      return reached(read(a, b))?.id === "bonded";
    },
    bondedWith(a) {
      let bestId: string | null = null;
      let bestOpinion = -Infinity;
      for (const [key, pair] of pairs) {
        const [first, second] = codec.parse(key);
        const other = first === a ? second : second === a ? first : null;
        if (other === null || !(pair.opinion > bestOpinion)) continue;
        if (reached(pair)?.id !== "bonded") continue;
        bestOpinion = pair.opinion;
        bestId = other;
      }
      return bestId;
    },
    prefersCompanyOf(a, b) {
      return a !== b && reached(read(a, b)) !== null;
    },
    refusesToSplit(a, b) {
      return a !== b && reached(read(a, b))?.id === "bonded";
    },
    partnersOf(a) {
      const ids: string[] = [];
      for (const key of pairs.keys()) {
        const [first, second] = codec.parse(key);
        if (first === a) ids.push(second);
        else if (second === a) ids.push(first);
      }
      return ids.sort();
    },
    policy: () => ({ ...current, milestones: current.milestones }),
    retune(patch) {
      current = { ...current, ...patch };
    },
    snapshot: () => {
      const out: Record<string, Relationship> = {};
      for (const [key, pair] of pairs) out[key] = { ...pair };
      return { pairs: out, policy: { ...current, milestones: current.milestones } };
    },
    restore(next) {
      current = { ...DEFAULTS, ...next.policy };
      const restored = new Map<string, Relationship>();
      for (const [key, pair] of Object.entries(next.pairs)) {
        if (!Number.isFinite(pair.familiarity) || !Number.isFinite(pair.opinion)) continue;
        restored.set(key, {
          familiarity: clamp(pair.familiarity, 0, current.familiarityMax),
          opinion: clamp(pair.opinion, current.opinionMin, current.opinionMax),
        });
      }
      pairs = restored;
    },
  };
}
