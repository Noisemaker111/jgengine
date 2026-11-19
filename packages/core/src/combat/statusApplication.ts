import { resolveRng } from "../random/resolveRng";
import { clamp01 } from "../math/scalar";
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
  status: string;
  /** Base landing probability in `[0,1]` before matchup scaling; defaults to 1 (always). */
  chance?: number;
  /** Base duration in milliseconds. */
  durationMs?: number;
  ticks?: number;
  magnitude?: number;
  /** Behaviour when the target already carries this status; defaults to `refresh`. */
  stack?: StatusStackPolicy;
}

export interface StatusInstance {
  status: string;
  stacks: number;
  /** Milliseconds of life remaining. */
  remainingMs: number;
  ticks: number;
  magnitude: number;
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

export interface StatusApplicationInput {
  spec: StatusApplicationSpec;
  scale?: StatusApplicationScale;
  current?: StatusInstance | null;
  immunity?: StatusImmunity | null;
  source?: string;
  /** Deterministic RNG returning `[0,1)`. Omitting it falls back to `Math.random` and warns once — pass `ctx.rng` or a seeded stream. */
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

export interface StatusApplicationOutcome {
  kind: StatusApplicationOutcomeKind;
  instance: StatusInstance | null;
  /** Effective landing chance after scaling, clamped to `[0,1]`. */
  chance: number;
  roll: number | null;
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
  const rng = resolveRng(input.rng, "applyStatus");

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
