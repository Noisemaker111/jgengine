/**
 * Difficulty is decision *quality*, owned in one place: a serializable {@link DifficultyProfile}
 * describing how fast, how accurately, and how far ahead an agent decides, plus appliers at the
 * universal decision seams every opponent shares — reacting to new information, choosing among
 * scored options, executing with error, spending abilities, and planning ahead. The same profile
 * tunes an RTS grunt, a street enemy, a boss's special-ability discipline, or a turn-based
 * lookahead player; the game supplies the domain (candidates, scores, moves) and this module
 * degrades or sharpens the choice. The game also supplies its own tier list, so the names and
 * numbers of its difficulty levels stay its data.
 *
 * Everything is deterministic under an injected rng, work is bounded by the profile, and state
 * (the reaction gate) is one small serializable object. Compose with the existing substrates
 * rather than replacing them: scale `MobBrainConfig.aggroRadius` by {@link DifficultyProfile.perceptionScale},
 * run `acquireTarget` candidates through {@link pickScored}, gate `advancePursuit` target swaps
 * behind {@link advanceReactionGate}, and score ability windows into {@link shouldUseAbility}.
 */

import { pickUniform } from "../random/pick";

/**
 * Serializable decision-quality data. All fields are plain numbers so a profile can live in a
 * save, an encounter definition, or a per-entity spawn record.
 */
export interface DifficultyProfile {
  /** Seconds before newly observed information takes effect (see {@link advanceReactionGate}). */
  reactionSeconds: number;
  /**
   * `0..1` chance of a degraded pick in {@link pickScored}, and the amplitude of perceived-value
   * noise in {@link shouldUseAbility} and {@link planLookahead}. `0` is optimal play.
   */
  decisionNoise: number;
  /** `0..1` amplitude of execution error returned by {@link executionError} (aim, lead, timing). */
  executionJitter: number;
  /**
   * `0..1` opportunity threshold for spending abilities: low values fire specials on weak
   * moments, high values hold them for strong windows (see {@link shouldUseAbility}).
   */
  abilityDiscipline: number;
  perceptionScale: number;
  planDepth: number;
  planWidth: number;
}

/**
 * A fresh profile from the caller's own tier list, with optional overrides — the tier names and
 * numbers stay the game's data: `difficultyProfile(TIERS, "boss", { reactionSeconds: 0.2 })`.
 * The source profile is copied, never mutated.
 *
 * @capability difficulty-profile derive a tuned decision-quality profile from one of the game's own tiers
 */
export function difficultyProfile<T extends string>(
  tiers: Readonly<Record<T, DifficultyProfile>>,
  tier: T,
  overrides?: Partial<DifficultyProfile>,
): DifficultyProfile {
  return { ...tiers[tier], ...overrides };
}

export interface ReactionGateState<T> {
  committed: T;
  pending: T;
  /** Seconds the pending value has been observed. */
  pendingSeconds: number;
}

/** @capability difficulty-reaction-gate-state fresh serializable reaction-gate state for one observed value */
export function createReactionGate<T>(initial: T): ReactionGateState<T> {
  return { committed: initial, pending: initial, pendingSeconds: 0 };
}

/** @capability difficulty-reaction-gate delay acting on new information by the profile's reaction time */
export function advanceReactionGate<T>(
  state: ReactionGateState<T>,
  dt: number,
  desired: T,
  profile: DifficultyProfile,
): T {
  if (Object.is(desired, state.committed)) {
    state.pending = desired;
    state.pendingSeconds = 0;
    return state.committed;
  }
  if (!Object.is(desired, state.pending)) {
    state.pending = desired;
    state.pendingSeconds = 0;
  }
  state.pendingSeconds += dt;
  if (state.pendingSeconds >= profile.reactionSeconds) {
    state.committed = state.pending;
    state.pendingSeconds = 0;
  }
  return state.committed;
}

export interface ScoredOption<T> {
  option: T;
  score: number;
}

/**
 * Choose from a scored option list at the profile's quality: with probability
 * `profile.decisionNoise` the pick is uniform over all options (the "wrong target / bad move"
 * mistake), otherwise it is the best score (first wins ties). Works over any decision the game
 * can score — acquisition candidates, ability choices, retreat routes, chess moves. Returns
 * `null` for an empty list. Allocation-free scan; one rng draw plus one more on a noisy pick.
 *
 * @capability difficulty-pick noisy argmax over scored options; expert picks best, easy blunders
 */
export function pickScored<T>(
  options: readonly ScoredOption<T>[],
  profile: DifficultyProfile,
  rng: () => number,
): T | null {
  if (options.length === 0) return null;
  if (profile.decisionNoise > 0 && rng() < profile.decisionNoise) {
    return pickUniform(rng, options)?.option ?? null;
  }
  let best = options[0]!;
  for (let i = 1; i < options.length; i++) {
    const candidate = options[i]!;
    if (candidate.score > best.score) best = candidate;
  }
  return best.option;
}

/**
 * Symmetric execution error in `[-scale * executionJitter, +scale * executionJitter]` — add it to
 * a yaw, a lead time, a throw power, or a release timestamp. `scale` maps the unitless jitter
 * onto the caller's units (e.g. pass max miss radians).
 *
 * @capability difficulty-execution-error symmetric aim/lead/timing error scaled by the profile
 */
export function executionError(profile: DifficultyProfile, rng: () => number, scale = 1): number {
  if (profile.executionJitter <= 0) return 0;
  return (rng() * 2 - 1) * profile.executionJitter * scale;
}

/**
 * Should the agent spend an ability now? `opportunity` is the caller-scored quality of this
 * moment in `0..1` (targets clumped for the AoE, player mid-animation, burn phase). The perceived
 * opportunity is fuzzed by `decisionNoise` and compared against `abilityDiscipline`: an easy
 * profile (low discipline, high noise) wastes cooldowns on weak moments and sometimes sits on a
 * perfect window; an expert profile fires exactly on strong windows. One rng draw when noisy.
 *
 * @capability difficulty-ability-gate spend-or-hold ability decision from a scored opportunity window
 */
export function shouldUseAbility(
  opportunity: number,
  profile: DifficultyProfile,
  rng: () => number,
): boolean {
  const perceived =
    profile.decisionNoise > 0 ? opportunity + (rng() * 2 - 1) * profile.decisionNoise : opportunity;
  return perceived >= profile.abilityDiscipline;
}

/**
 * The game-owned decision domain {@link planLookahead} searches. States and moves are caller
 * types; the planner never inspects them.
 */
export interface LookaheadDomain<S, M> {
  moves(state: S): readonly ScoredOption<M>[];
  /** The successor state after the player to move plays `move`. Must not mutate `state`. */
  apply(state: S, move: M): S;
  evaluate(state: S): number;
  adversarial?: boolean;
}

function rankedFrontier<S, M>(
  domain: LookaheadDomain<S, M>,
  state: S,
  width: number,
): readonly ScoredOption<M>[] {
  const moves = domain.moves(state);
  if (moves.length <= width) return moves;
  return [...moves].sort((a, b) => b.score - a.score).slice(0, width);
}

function lookaheadValue<S, M>(
  domain: LookaheadDomain<S, M>,
  state: S,
  depth: number,
  width: number,
): number {
  if (depth <= 0) return domain.evaluate(state);
  const frontier = rankedFrontier(domain, state, width);
  if (frontier.length === 0) return domain.evaluate(state);
  const negate = domain.adversarial !== false;
  let best = Number.NEGATIVE_INFINITY;
  for (const candidate of frontier) {
    const child = lookaheadValue(domain, domain.apply(state, candidate.option), depth - 1, width);
    const value = negate ? -child : child;
    if (value > best) best = value;
  }
  return best;
}

/**
 * Pick the agent's next move by bounded lookahead: a depth-limited negamax (or single-perspective
 * sequence search when `adversarial: false`) over the caller's {@link LookaheadDomain}, exploring
 * at most `profile.planWidth` moves per ply to `profile.planDepth` plies, with the final root
 * choice run through {@link pickScored} so `decisionNoise` still injects tier-appropriate
 * blunders. Depth `1` is greedy — an easy profile literally cannot see the fork coming; an
 * expert profile finds multi-ply tactics. Work is bounded by `planWidth ** planDepth` domain
 * calls; run it at decision cadence (turns, ability windows, order re-evaluation), not per frame.
 *
 * @capability difficulty-lookahead depth/width-bounded deterministic planner for turn-based or sequential decisions
 */
export function planLookahead<S, M>(
  root: S,
  domain: LookaheadDomain<S, M>,
  profile: DifficultyProfile,
  rng: () => number,
): M | null {
  const depth = Math.max(1, Math.floor(profile.planDepth));
  const width = Math.max(1, Math.floor(profile.planWidth));
  const negate = domain.adversarial !== false;
  const frontier = rankedFrontier(domain, root, width);
  if (frontier.length === 0) return null;
  const valued: ScoredOption<M>[] = [];
  for (const candidate of frontier) {
    const child = lookaheadValue(domain, domain.apply(root, candidate.option), depth - 1, width);
    valued.push({ option: candidate.option, score: negate ? -child : child });
  }
  return pickScored(valued, profile, rng);
}
