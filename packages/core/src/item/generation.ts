import { pickWeighted } from "../random/pick";

/** Injected randomness — the same `() => number` in `[0, 1)` contract used across core. */
export type GenRng = () => number;

/** Values chosen so far, keyed by slot id. Later steps read earlier slots to make dependent choices. */
export type GenSlots = Record<string, unknown>;

/** Read access to the roll in progress, handed to every step, constraint, transform, and the assembler. */
export interface GenState {
  readonly rng: GenRng;
  /** Value chosen for `slot`; throws if the slot has not been set yet (catches out-of-order steps). */
  get<T = unknown>(slot: string): T;
  /** Value chosen for `slot`, or `undefined` when the slot has not been set. */
  peek<T = unknown>(slot: string): T | undefined;
}

/** One recorded decision — the trail that lets UI, debugging, and regeneration explain an output. */
export interface GenTraceEntry {
  slot: string;
  kind: "choice" | "derive" | "reject";
  /** The chosen/derived value, or the rejection reason string when `kind` is `"reject"`. */
  value: unknown;
}

/** What a step did: set its slot, or reject the whole attempt with a reason. */
export type GenStepOutcome =
  | { readonly status: "set"; readonly value: unknown }
  | { readonly status: "reject"; readonly reason: string };

/** A single stage of a generation pipeline: chooses or derives one slot, or rejects the attempt. */
export interface GenStep {
  readonly slot: string;
  readonly kind: "choice" | "derive";
  run(state: GenState): GenStepOutcome;
}

/** A weighted candidate for a {@link choose} step. `weight` defaults to 1 (uniform). */
export interface GenOption<T> {
  value: T;
  weight?: number;
}

/** Configuration for a {@link choose} step. */
export interface ChooseSpec<T> {
  /** Candidate values for this slot, possibly dependent on already-chosen slots. */
  options: (state: GenState) => readonly GenOption<T>[];
  /** Optional filter: only options passing survive the draw. An empty surviving pool rejects the attempt. */
  eligible?: (value: T, state: GenState) => boolean;
}

/**
 * A weighted (optionally dependent, optionally constrained) choice step. Draws one option with
 * probability proportional to `weight` from a candidate list that may itself depend on earlier slots,
 * after filtering by `eligible`. Consumes exactly one `rng()` per draw, so composing it preserves the
 * random stream of a hand-rolled `pickWeighted`.
 */
export function choose<T>(slot: string, spec: ChooseSpec<T>): GenStep {
  return {
    slot,
    kind: "choice",
    run(state) {
      const all = spec.options(state);
      const pool = spec.eligible === undefined ? all : all.filter((option) => spec.eligible!(option.value, state));
      const picked = pickWeighted(state.rng, pool, (option) => option.weight ?? 1);
      if (picked === undefined) return { status: "reject", reason: `no eligible option for "${slot}"` };
      return { status: "set", value: picked.value };
    },
  };
}

/** A transform step: computes this slot's value from earlier slots (and optionally `rng`), never rejecting. */
export function derive<T>(slot: string, fn: (state: GenState) => T): GenStep {
  return { slot, kind: "derive", run: (state) => ({ status: "set", value: fn(state) }) };
}

/**
 * An escape-hatch step for logic `choose`/`derive` cannot express — conditional RNG consumption,
 * caller-defined samplers, or constraints that reject with a specific reason. `run` returns `set` or
 * `reject` directly.
 */
export function step(slot: string, run: (state: GenState) => GenStepOutcome): GenStep {
  return { slot, kind: "choice", run };
}

/** A composable generation pipeline over caller-defined slots, assembled into a typed output `TOut`. */
export interface GenPipeline<TOut> {
  /** Ordered stages. Each writes one slot; later steps read earlier ones. */
  steps: readonly GenStep[];
  /** Build the final typed output from the completed slots. May consume `rng` for post-choice jitter. */
  assemble: (state: GenState) => TOut;
  /** Whole-output validation; return a reason string to reject (and reroll) or `null` to accept. */
  validate?: (value: TOut, state: GenState) => string | null;
  /** Bounded full-pipeline attempts before failing. Defaults to 8. */
  maxAttempts?: number;
}

/** A generated output plus its provenance. */
export interface GenSuccess<TOut> {
  status: "ok";
  value: TOut;
  /** Final chosen/derived value per slot. */
  slots: Readonly<GenSlots>;
  /** Every decision across every attempt, in order — choices, derives, and rejected rerolls. */
  trace: readonly GenTraceEntry[];
  /** How many full-pipeline attempts it took (1 when nothing rejected). */
  attempts: number;
}

/** A generation that exhausted its attempt budget without producing a valid output. */
export interface GenFailure {
  status: "failed";
  /** Why the last attempt failed. */
  reason: string;
  trace: readonly GenTraceEntry[];
  attempts: number;
}

/** The outcome of {@link generate}: a successful output with provenance, or a bounded-attempt failure. */
export type GenResult<TOut> = GenSuccess<TOut> | GenFailure;

function makeState(rng: GenRng, slots: GenSlots): GenState {
  return {
    rng,
    get(slot) {
      if (!(slot in slots)) throw new Error(`generation slot "${slot}" read before it was set`);
      return slots[slot] as never;
    },
    peek(slot) {
      return slots[slot] as never;
    },
  };
}

/**
 * Run a {@link GenPipeline} against an injected RNG to produce a deterministic output with full
 * provenance. Steps run in order over an accumulating slot bag; a step (or the whole-output
 * `validate`) that rejects rerolls the entire pipeline on the advancing stream, up to `maxAttempts`.
 * Identical `(pipeline, seed)` inputs reproduce identical results across server/client and save/load.
 *
 * The pipeline owns only orchestration — weighted/dependent choice, constraints, transforms,
 * validation, and the provenance trail. Callers compose loot tables, affix rollers, and modular-part
 * assembly inside `derive`/`assemble` rather than this primitive duplicating them.
 *
 * @capability procedural-generation compose a deterministic generated item from weighted/dependent choices, constraints, transforms, and provenance
 */
export function generate<TOut>(pipeline: GenPipeline<TOut>, rng: GenRng): GenResult<TOut> {
  const maxAttempts = pipeline.maxAttempts ?? 8;
  const trace: GenTraceEntry[] = [];
  let lastReason = "no attempts run";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const slots: GenSlots = {};
    const state = makeState(rng, slots);
    let rejected = false;

    for (const s of pipeline.steps) {
      const outcome = s.run(state);
      if (outcome.status === "reject") {
        trace.push({ slot: s.slot, kind: "reject", value: outcome.reason });
        lastReason = outcome.reason;
        rejected = true;
        break;
      }
      slots[s.slot] = outcome.value;
      trace.push({ slot: s.slot, kind: s.kind, value: outcome.value });
    }
    if (rejected) continue;

    const value = pipeline.assemble(state);
    const invalid = pipeline.validate?.(value, state) ?? null;
    if (invalid !== null) {
      trace.push({ slot: "__validate__", kind: "reject", value: invalid });
      lastReason = invalid;
      continue;
    }
    return { status: "ok", value, slots, trace, attempts: attempt };
  }

  return { status: "failed", reason: lastReason, trace, attempts: maxAttempts };
}
