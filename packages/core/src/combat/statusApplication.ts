/**
 * How a fresh application behaves when the target already carries the status.
 * - `refresh` — reset duration, hold the existing stack count.
 * - `stack` — add `add` stacks (default 1) up to `max`, and refresh duration.
 * - `replace` — overwrite duration and magnitude, stacks reset to 1.
 * - `ignore` — leave the existing instance untouched (first application wins).
 */
export type StatusStackPolicy =
  | { kind: "refresh" }
  | { kind: "stack"; max?: number; add?: number }
  | { kind: "replace" }
  | { kind: "ignore" };

/**
 * A serializable, effect-agnostic description of a status a hit tries to apply: an opaque
 * `status` id the game routes to its own effect/DoT pipeline, a base landing `chance`, and the
 * duration/ticks/magnitude/attribution/stacking data the resolver needs. The engine never
 * interprets `status` — it is a reference, not a built-in condition.
 */
export interface StatusApplicationSpec {
  /** Opaque status/effect id the game applies (`"burn"`, `"slow"`, `"amplify"`). */
  status: string;
  /** Base landing probability in `[0,1]` before matchup scaling; defaults to 1 (always). */
  chance?: number;
  /** Base duration in milliseconds. */
  durationMs?: number;
  /** Base number of periodic ticks, when the status is periodic. */
  ticks?: number;
  /** Base per-application magnitude (damage/heal per tick, buff strength). */
  magnitude?: number;
  /** Behaviour when the target already carries this status; defaults to `refresh`. */
  stack?: StatusStackPolicy;
}

/** A live status carried by a target — the serializable, replicable state a status application mutates. */
export interface StatusInstance {
  status: string;
  /** Current stack count (>= 1 while active). */
  stacks: number;
  /** Milliseconds of life remaining. */
  remainingMs: number;
  /** Remaining periodic ticks, when tracked. */
  ticks: number;
  /** Per-application magnitude in force. */
  magnitude: number;
  /** Attribution: who/what applied (or last refreshed) the status. */
  source?: string;
}

/** Statuses a target cannot receive at all — the immunity half of application policy. */
export interface StatusImmunity {
  statuses?: readonly string[];
}

/** Matchup-derived multipliers on the independent application axes. Each defaults to 1. */
export interface StatusApplicationScale {
  applyChance?: number;
  magnitude?: number;
  duration?: number;
}

/** Everything `resolveStatusApplication` needs; all data plus an injected RNG for reproducibility. */
export interface StatusApplicationInput {
  spec: StatusApplicationSpec;
  /** Independent multipliers (typically from `resolveMatchup`). */
  scale?: StatusApplicationScale;
  /** The target's existing instance of this status, or `null`/absent when unafflicted. */
  current?: StatusInstance | null;
  immunity?: StatusImmunity | null;
  /** Attribution written onto the resulting instance. */
  source?: string;
  /** Deterministic RNG returning `[0,1)`; defaults to `Math.random`. Pass a seeded stream for reproducibility. */
  rng?: () => number;
}

/** Why an application did or did not take, plus the roll for provenance. */
export type StatusApplicationOutcomeKind =
  | "applied"
  | "refreshed"
  | "stacked"
  | "replaced"
  | "immune"
  | "missed"
  | "ignored";

/** The result of one status application: the outcome, the resulting instance (if any), and the roll. */
export interface StatusApplicationOutcome {
  kind: StatusApplicationOutcomeKind;
  /** The instance after application, or `null` when the status did not land / was blocked. */
  instance: StatusInstance | null;
  /** Effective landing chance after scaling, clamped to `[0,1]`. */
  chance: number;
  /** The RNG draw compared against `chance`; `null` when no roll was taken (immune/ignored). */
  roll: number | null;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Resolve one status application: reject on immunity, roll landing chance against injected RNG,
 * scale magnitude/duration by the matchup, then fold into any existing instance per the stacking
 * policy. Deterministic given a seeded `rng`; pure over serializable data, so authority can run it
 * and replicate only the returned `instance`.
 *
 * @capability status-application resolve a data-defined status application with chance, matchup scaling, and stacking policy
 */
export function resolveStatusApplication(input: StatusApplicationInput): StatusApplicationOutcome {
  const { spec, scale, current, immunity, source } = input;
  const rng = input.rng ?? Math.random;

  if (immunity?.statuses?.includes(spec.status) === true) {
    return { kind: "immune", instance: current ?? null, chance: 0, roll: null };
  }

  const present = current ?? null;
  const policy = spec.stack ?? { kind: "refresh" };
  if (present !== null && policy.kind === "ignore") {
    return { kind: "ignored", instance: present, chance: 0, roll: null };
  }

  const chance = clamp01((spec.chance ?? 1) * (scale?.applyChance ?? 1));
  const roll = rng();
  if (roll >= chance) {
    return { kind: "missed", instance: present, chance, roll };
  }

  const magnitude = (spec.magnitude ?? 0) * (scale?.magnitude ?? 1);
  const durationMs = (spec.durationMs ?? 0) * (scale?.duration ?? 1);
  const ticks = Math.round((spec.ticks ?? 0) * (scale?.duration ?? 1));

  if (present === null) {
    const instance: StatusInstance = {
      status: spec.status,
      stacks: 1,
      remainingMs: durationMs,
      ticks,
      magnitude,
      ...(source !== undefined ? { source } : {}),
    };
    return { kind: "applied", instance, chance, roll };
  }

  if (policy.kind === "replace") {
    const instance: StatusInstance = {
      status: spec.status,
      stacks: 1,
      remainingMs: durationMs,
      ticks,
      magnitude,
      ...(source !== undefined ? { source } : {}),
    };
    return { kind: "replaced", instance, chance, roll };
  }

  if (policy.kind === "stack") {
    const add = policy.add ?? 1;
    const max = policy.max ?? Number.POSITIVE_INFINITY;
    const stacks = Math.min(max, present.stacks + add);
    const instance: StatusInstance = {
      status: spec.status,
      stacks,
      remainingMs: durationMs,
      ticks,
      magnitude,
      ...(source !== undefined ? { source } : present.source !== undefined ? { source: present.source } : {}),
    };
    return { kind: "stacked", instance, chance, roll };
  }

  // refresh: reset duration/ticks/magnitude, keep stack count.
  const instance: StatusInstance = {
    status: spec.status,
    stacks: present.stacks,
    remainingMs: durationMs,
    ticks,
    magnitude,
    ...(source !== undefined ? { source } : present.source !== undefined ? { source: present.source } : {}),
  };
  return { kind: "refreshed", instance, chance, roll };
}
