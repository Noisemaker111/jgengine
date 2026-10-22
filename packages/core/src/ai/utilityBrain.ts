import { devtools } from "../devtools/devtools";
import { clamp } from "../math/scalar";
import { resolveRng } from "../random/resolveRng";
import type { NeedSet } from "../sim/needs";

/**
 * How one need's satisfaction maps to an option's appeal: `1` at `from`, `0` at `to`, clamped
 * outside. Read satisfaction `1` as a full meter; pair with {@link UtilityTerm.invert} when a full
 * meter is what makes the option attractive.
 */
export type ResponseCurve =
  | { readonly kind: "linear"; readonly from: number; readonly to: number }
  /** Same shape as `linear`, raised to `exponent` (default `2`), so appeal stays flat until it matters. */
  | { readonly kind: "quadratic"; readonly from: number; readonly to: number; readonly exponent?: number }
  /** Smooth S-curve through `0.5` at `midpoint`; `steepness` (default `10`) is how sharp the knee is. */
  | { readonly kind: "logistic"; readonly midpoint: number; readonly steepness?: number }
  /** `exp(-rate·x)` normalized to reach exactly 1 at empty and 0 at full; sharper than `linear` near empty. */
  | { readonly kind: "exponential"; readonly rate: number }
  /** Step: `value` (default `1`) while satisfaction is at or below `at`, else `0`. */
  | { readonly kind: "threshold"; readonly at: number; readonly value?: number };

/** Sample a response curve at a `0..1` satisfaction. Deterministic, allocation-free. */
export function sampleResponseCurve(curve: ResponseCurve, satisfaction: number): number {
  const x = clamp(satisfaction, 0, 1);
  switch (curve.kind) {
    case "linear":
    case "quadratic": {
      const span = curve.to - curve.from;
      const t = span === 0 ? (x <= curve.from ? 0 : 1) : clamp((x - curve.from) / span, 0, 1);
      if (curve.kind === "linear") return 1 - t;
      const exponent = Math.max(1, curve.exponent ?? 2);
      return Math.pow(1 - t, exponent);
    }
    case "logistic": {
      const steepness = Math.max(0.0001, curve.steepness ?? 10);
      const low = rawLogistic(0, curve.midpoint, steepness);
      const high = rawLogistic(1, curve.midpoint, steepness);
      if (low === high) return x <= curve.midpoint ? 1 : 0;
      return clamp((rawLogistic(x, curve.midpoint, steepness) - high) / (low - high), 0, 1);
    }
    case "exponential": {
      const rate = curve.rate;
      if (!(rate > 0)) return 1 - x;
      const tail = Math.exp(-rate);
      return clamp((Math.exp(-rate * x) - tail) / (1 - tail), 0, 1);
    }
    case "threshold":
      return x <= curve.at ? (curve.value ?? 1) : 0;
  }
}

function rawLogistic(x: number, midpoint: number, steepness: number): number {
  return 1 / (1 + Math.exp(steepness * (x - midpoint)));
}

/** One need's contribution to an option's appeal. */
export interface UtilityTerm {
  /** Declared need id on the brain's need set; resolved once at construction. */
  readonly need: string;
  readonly curve: ResponseCurve;
  /** Multiplier on the sampled appeal (negative pushes the option away). Default `1`. */
  readonly weight?: number;
  /** Sample `1 - satisfaction` — an option that wants a *full* meter rather than an empty one. */
  readonly invert?: boolean;
}

/** A thing an agent can decide to do, scored against its needs. */
export interface UtilityOption {
  readonly id: string;
  /** Appeal regardless of needs — the option's standing preference. Default `0`. */
  readonly base?: number;
  readonly terms?: readonly UtilityTerm[];
}

/** One reachable instance of an option this tick; `cost` is the caller's own effort number. */
export interface UtilityCandidate {
  /** Option id. Unknown ids are skipped, so content can be removed at runtime. */
  readonly option: string;
  /**
   * Caller-computed effort — travel distance, queue seconds, price, risk. Scored as
   * `-costWeight · cost`, so the game keeps ownership of what a meter means. Default `0`.
   */
  readonly cost?: number;
}

/** A need level that overrides the sticky pick the moment it is crossed. */
export interface UtilityInterrupt {
  readonly need: string;
  /** Fraction that fires the interrupt. */
  readonly at: number;
  /** Fire while the need is `below` (default, a starving agent) or `above` (panic, overheat). */
  readonly when?: "below" | "above";
  /** Force this option when it is among the candidates; omit to just re-decide without stickiness. */
  readonly option?: string;
}

/** Why the brain's pick changed on the tick it changed. */
export type UtilitySwitchReason = "initial" | "score" | "interrupt" | "unavailable";

/** The outcome of one {@link UtilityBrain.decide}. Valid until the next `decide` call. */
export interface UtilityDecision {
  readonly option: string | null;
  /** Costed score of the chosen candidate. */
  readonly score: number;
  /** The pick changed on this tick. */
  readonly changed: boolean;
  readonly reason: UtilitySwitchReason | null;
  /** An interrupt fired this tick, whether or not it changed the pick. */
  readonly interrupted: boolean;
}

/** In-play dials that stay reachable through {@link UtilityBrain.retune}. */
export interface UtilityTunables {
  /** Score margin a rival must beat the held pick by. Default `0.05`; `0` switches on any lead. */
  readonly switchMargin?: number;
  /** Seconds a pick is held before a non-interrupt rival may replace it. Default `0`. */
  readonly minHoldSeconds?: number;
  /** Score points per candidate cost unit. Default `1`. */
  readonly costWeight?: number;
  /** Symmetric score noise amplitude from the injected `rng`; default `0` (ties keep the held pick). */
  readonly jitter?: number;
}

/** Everything a utility brain needs: the shared need set, its scored options, and selection policy. */
export interface UtilityBrainConfig extends UtilityTunables {
  readonly needs: NeedSet;
  readonly options: readonly UtilityOption[];
  readonly interrupts?: readonly UtilityInterrupt[];
  /** `[0,1)` source for `jitter`; pass `ctx.rng`. Only read when `jitter > 0`. */
  readonly rng?: () => number;
  /** Register a devtools probe under this name so the perf overlay shows the live pick. */
  readonly devtoolsName?: string;
}

/** One option's need-driven score, ignoring candidate cost. */
export interface UtilityScore {
  readonly option: string;
  readonly score: number;
}

/** JSON-safe view of a brain for the devtools overlay and bug reports. */
export interface UtilityDebugSnapshot {
  readonly chosen: string | null;
  readonly score: number;
  readonly reason: UtilitySwitchReason | null;
  readonly switchMargin: number;
  readonly costWeight: number;
  readonly holdSeconds: number;
  readonly needs: readonly { id: string; value: number; fraction: number }[];
  readonly options: readonly UtilityScore[];
}

/** Serializable brain state: the held pick plus any in-play retuning. Needs save separately. */
export interface UtilityBrainSnapshot {
  option: string | null;
  score: number;
  holdSeconds: number;
  switchMargin: number;
  minHoldSeconds: number;
  costWeight: number;
  jitter: number;
}

/**
 * Utility-scored action selection over decaying needs: score every option's appeal through response
 * curves, pick the best reachable candidate minus its cost, and hold that pick until a rival clears
 * the hysteresis margin — unless a declared interrupt fires.
 *
 * The tick cost is bounded by declared content: `advance` is O(needs), `decide` is
 * O(options × terms + candidates + interrupts), with no allocation on either path.
 */
export interface UtilityBrain {
  /** Decay the injected needs by `dt` seconds and age the hold timer. */
  advance(dt: number): void;
  /**
   * Pick among `candidates` for this tick. The returned object is reused, so read it before the
   * next call. `cost` defaults weight candidates down linearly (travel, queues, price).
   */
  decide(candidates: readonly UtilityCandidate[]): UtilityDecision;
  chosen(): string | null;
  /** Need-driven score of one option right now, cost excluded. Throws on an unknown id. */
  scoreOf(optionId: string): number;
  /** Every option's need-driven score in declared order. Allocates — debug and tests. */
  scores(): readonly UtilityScore[];
  retune(patch: UtilityTunables): void;
  debugSnapshot(): UtilityDebugSnapshot;
  snapshot(): UtilityBrainSnapshot;
  restore(next: UtilityBrainSnapshot): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

interface CompiledTerm {
  needIndex: number;
  curve: ResponseCurve;
  weight: number;
  invert: boolean;
}

interface CompiledOption {
  id: string;
  base: number;
  terms: CompiledTerm[];
}

interface CompiledInterrupt {
  needIndex: number;
  at: number;
  when: "below" | "above";
  optionIndex: number;
}

interface MutableDecision {
  option: string | null;
  score: number;
  changed: boolean;
  reason: UtilitySwitchReason | null;
  interrupted: boolean;
}

/**
 * Create a utility brain over an existing {@link NeedSet}. The need set is injected, not owned, so
 * the game shows the same hunger the brain scores and persists one copy.
 *
 * @capability utility-brain pick actions by decaying-need appeal with response curves, hysteresis and interrupts
 */
export function createUtilityBrain(config: UtilityBrainConfig): UtilityBrain {
  const needs = config.needs;
  const optionIndex = new Map<string, number>();
  const options: CompiledOption[] = config.options.map((option, index) => {
    if (optionIndex.has(option.id)) throw new Error(`duplicate utility option "${option.id}"`);
    optionIndex.set(option.id, index);
    const terms = (option.terms ?? []).map((term) => {
      const needIndex = needs.indexOf(term.need);
      if (needIndex < 0) {
        throw new Error(`utility option "${option.id}" scores need "${term.need}", which the need set does not declare`);
      }
      return { needIndex, curve: term.curve, weight: term.weight ?? 1, invert: term.invert === true };
    });
    return { id: option.id, base: option.base ?? 0, terms };
  });
  const interrupts: CompiledInterrupt[] = (config.interrupts ?? []).map((interrupt) => {
    const needIndex = needs.indexOf(interrupt.need);
    if (needIndex < 0) {
      throw new Error(`utility interrupt watches need "${interrupt.need}", which the need set does not declare`);
    }
    const forced = interrupt.option === undefined ? -1 : optionIndex.get(interrupt.option) ?? -1;
    if (interrupt.option !== undefined && forced < 0) {
      throw new Error(`utility interrupt forces unknown option "${interrupt.option}"`);
    }
    return { needIndex, at: interrupt.at, when: interrupt.when ?? "below", optionIndex: forced };
  });

  let switchMargin = Math.max(0, config.switchMargin ?? 0.05);
  let minHoldSeconds = Math.max(0, config.minHoldSeconds ?? 0);
  let costWeight = config.costWeight ?? 1;
  let jitter = Math.max(0, config.jitter ?? 0);
  let rng = config.rng;

  let heldIndex = -1;
  let heldScore = 0;
  let holdSeconds = 0;

  const optionScores = new Float64Array(options.length);
  const decision: MutableDecision = { option: null, score: 0, changed: false, reason: null, interrupted: false };

  function scoreOption(compiled: CompiledOption): number {
    let score = compiled.base;
    for (const term of compiled.terms) {
      const fraction = needs.fractionAt(term.needIndex);
      score += term.weight * sampleResponseCurve(term.curve, term.invert ? 1 - fraction : fraction);
    }
    return score;
  }

  function scoreList(): UtilityScore[] {
    return options.map((option) => ({ option: option.id, score: scoreOption(option) }));
  }

  function busyInterrupt(): number {
    for (let index = 0; index < interrupts.length; index += 1) {
      const interrupt = interrupts[index]!;
      const fraction = needs.fractionAt(interrupt.needIndex);
      const crossed = interrupt.when === "below" ? fraction <= interrupt.at : fraction >= interrupt.at;
      if (crossed) return index;
    }
    return -1;
  }

  function costedScore(index: number, candidates: readonly UtilityCandidate[]): number {
    for (const candidate of candidates) {
      if (optionIndex.get(candidate.option) === index) {
        return optionScores[index]! - costWeight * (candidate.cost ?? 0);
      }
    }
    return Number.NaN;
  }

  function setHeld(index: number, score: number, reason: UtilitySwitchReason): void {
    heldIndex = index;
    heldScore = score;
    holdSeconds = 0;
    decision.option = options[index]?.id ?? null;
    decision.score = score;
    decision.changed = true;
    decision.reason = reason;
  }

  function keepHeld(score: number): void {
    heldScore = score;
    decision.option = options[heldIndex]?.id ?? null;
    decision.score = score;
  }

  function decide(candidates: readonly UtilityCandidate[]): UtilityDecision {
    decision.changed = false;
    decision.reason = null;
    let rngSource: (() => number) | null = rng ?? null;
    if (jitter > 0 && rngSource === null) {
      rngSource = resolveRng(undefined, "createUtilityBrain");
      rng = rngSource;
    }
    for (let index = 0; index < options.length; index += 1) {
      let score = scoreOption(options[index]!);
      if (jitter > 0) score += (rngSource!() * 2 - 1) * jitter;
      optionScores[index] = score;
    }

    let bestIndex = -1;
    let bestScore = -Infinity;
    let heldCandidateScore = Number.NaN;
    for (const candidate of candidates) {
      const index = optionIndex.get(candidate.option);
      if (index === undefined) continue;
      const score = optionScores[index]! - costWeight * (candidate.cost ?? 0);
      if (index === heldIndex) heldCandidateScore = score;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const interrupt = busyInterrupt();
    decision.interrupted = interrupt >= 0;
    const heldReachable = heldIndex >= 0 && Number.isFinite(heldCandidateScore);

    if (interrupt >= 0) {
      const forced = interrupts[interrupt]!.optionIndex;
      const forcedScore = forced >= 0 ? costedScore(forced, candidates) : Number.NaN;
      if (forced >= 0 && Number.isFinite(forcedScore)) {
        if (forced === heldIndex) keepHeld(forcedScore);
        else setHeld(forced, forcedScore, "interrupt");
      } else if (bestIndex >= 0 && (!heldReachable || bestScore > heldCandidateScore)) {
        setHeld(bestIndex, bestScore, "interrupt");
      } else if (heldReachable) {
        keepHeld(heldCandidateScore);
      } else {
        keepHeld(heldIndex < 0 ? 0 : heldScore);
      }
      return decision;
    }

    if (bestIndex < 0) {
      keepHeld(heldIndex < 0 ? 0 : heldScore);
      if (heldIndex < 0) decision.option = null;
      return decision;
    }

    if (heldIndex < 0) {
      setHeld(bestIndex, bestScore, "initial");
      return decision;
    }

    if (!heldReachable) {
      setHeld(bestIndex, bestScore, "unavailable");
      return decision;
    }

    keepHeld(heldCandidateScore);
    if (bestIndex !== heldIndex && bestScore > heldScore + switchMargin && holdSeconds >= minHoldSeconds) {
      setHeld(bestIndex, bestScore, "score");
    }
    return decision;
  }

  const unregister = config.devtoolsName === undefined
    ? null
    : devtools.probes.register(config.devtoolsName, () => debugLine());

  function debugLine(): string {
    const stick = `margin ${switchMargin.toFixed(2)} hold ${holdSeconds.toFixed(1)}s`;
    const pick = `${decision.option ?? "none"} ${decision.score.toFixed(2)}${decision.reason === null ? "" : ` (${decision.reason})`}`;
    const urgent = needs.mostUrgent();
    const need = urgent === null ? "no needs" : `${urgent.id} ${urgent.fraction.toFixed(2)}`;
    return `${pick} · ${need} · ${stick}`;
  }

  return {
    advance(dt) {
      if (!(dt > 0)) return;
      needs.tick(dt);
      holdSeconds += dt;
    },
    decide,
    chosen: () => (heldIndex < 0 ? null : options[heldIndex]!.id),
    scoreOf(optionId) {
      const index = optionIndex.get(optionId);
      if (index === undefined) throw new Error(`unknown utility option "${optionId}"`);
      return scoreOption(options[index]!);
    },
    scores: () => scoreList(),
    retune(patch) {
      if (patch.switchMargin !== undefined) switchMargin = Math.max(0, patch.switchMargin);
      if (patch.minHoldSeconds !== undefined) minHoldSeconds = Math.max(0, patch.minHoldSeconds);
      if (patch.costWeight !== undefined) costWeight = patch.costWeight;
      if (patch.jitter !== undefined) jitter = Math.max(0, patch.jitter);
    },
    debugSnapshot() {
      const readings: { id: string; value: number; fraction: number }[] = [];
      for (const id of needs.ids()) {
        readings.push({ id, value: needs.value(id), fraction: needs.fraction(id) });
      }
      return {
        chosen: decision.option,
        score: decision.score,
        reason: decision.reason,
        switchMargin,
        costWeight,
        holdSeconds,
        needs: readings,
        options: scoreList(),
      };
    },
    snapshot: () => ({
      option: heldIndex < 0 ? null : options[heldIndex]!.id,
      score: heldScore,
      holdSeconds,
      switchMargin,
      minHoldSeconds,
      costWeight,
      jitter,
    }),
    restore(next) {
      const index = next.option === null ? undefined : optionIndex.get(next.option);
      heldIndex = index ?? -1;
      heldScore = next.score;
      holdSeconds = Math.max(0, next.holdSeconds);
      switchMargin = Math.max(0, next.switchMargin);
      minHoldSeconds = Math.max(0, next.minHoldSeconds);
      costWeight = next.costWeight;
      jitter = Math.max(0, next.jitter);
      decision.option = heldIndex < 0 ? null : options[heldIndex]!.id;
      decision.score = heldScore;
      decision.changed = false;
      decision.reason = null;
      decision.interrupted = false;
    },
    dispose() {
      unregister?.();
    },
  };
}
