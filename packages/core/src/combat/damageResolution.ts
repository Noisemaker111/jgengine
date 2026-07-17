import {
  resolveMatchup,
  type DamageChannelId,
  type DamageMatchup,
  type ResolvedMatchup,
  type TargetTraitId,
} from "./damageMatchup";
import {
  resolveReceivedDamage,
  type DamageContext,
  type ReceivedDamageResult,
  type ReceivedModifier,
} from "./receivedDamage";
import {
  resolveStatusApplication,
  type StatusApplicationOutcome,
  type StatusApplicationSpec,
  type StatusImmunity,
  type StatusInstance,
} from "./statusApplication";

/**
 * One data-defined damage hit: a channel, a base impact, the target's traits and carried statuses,
 * and the caller-owned matchup/received/status data that shapes the outcome. Everything is
 * serializable; the only non-data input is the injected `rng`, so authority can resolve a hit and
 * replicate the returned instances.
 */
export interface DamageHitInput {
  channel: DamageChannelId;
  /** Base direct impact before matchup and receiver modifiers. */
  impact: number;
  target: string;
  source?: string;
  /** Traits the target presents to the matchup (`"armored"`, `"shielded"`). */
  targetTraits?: readonly TargetTraitId[];
  /** Statuses the target already carries — feeds received predicates and stacking. */
  targetStatuses?: readonly string[];
  /** Caller tags on the hit (`"crit"`, `"aoe"`). */
  tags?: readonly string[];
  /** Channel-vs-trait table; omitted means identity outputs. */
  matchup?: DamageMatchup;
  /** Receiver-side modifiers to run over the post-matchup impact. */
  received?: readonly ReceivedModifier[];
  /** A status this hit tries to apply; omitted means impact only. */
  status?: StatusApplicationSpec;
  /** The target's existing instance of `status`, for stacking/refresh. */
  currentStatus?: StatusInstance | null;
  /** Statuses the target is immune to. */
  immunity?: StatusImmunity | null;
  /** Deterministic RNG for the status roll; defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * The full, provenance-rich result of resolving a hit — every stage kept for UI and debugging.
 * `impact` is the final number to drain; `matchup`, `received`, and `status` expose exactly how it
 * got there. Authority applies `impact` (plus `received.redirects`/`conversions`) and the returned
 * status `instance`; nothing here mutates game state.
 */
export interface DamageHitResolution {
  channel: DamageChannelId;
  /** Final impact on the primary target/channel after matchup and receiver modifiers. */
  impact: number;
  immune: boolean;
  /** The matchup outputs and their contributions. */
  matchup: ResolvedMatchup;
  /** The receiver-side pass over the matchup-scaled impact. */
  received: ReceivedDamageResult;
  /** The status application outcome, when the hit carried a `status`. */
  status?: StatusApplicationOutcome;
}

/**
 * Resolve a full damage hit through the data-defined pipeline: score the channel against the
 * target's traits ({@link resolveMatchup}), scale base impact by the matchup's `impact` axis,
 * run receiver-side modifiers ({@link resolveReceivedDamage}), then roll status application scaled
 * by the matchup's `applyChance`/`magnitude`/`duration` axes ({@link resolveStatusApplication}).
 * Pure and deterministic given a seeded `rng`; returns full provenance and never mutates state, so
 * it is safe to run on the authority and replicate the results.
 *
 * @capability damage-hit resolve a full data-defined damage hit — matchup, impact, receiver modifiers, and status application — with provenance
 */
export function resolveDamageHit(input: DamageHitInput): DamageHitResolution {
  const matchup = resolveMatchup(input.matchup ?? { entries: {} }, input.channel, input.targetTraits ?? []);

  const context: DamageContext = {
    channel: input.channel,
    target: input.target,
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.targetStatuses !== undefined ? { targetStatuses: input.targetStatuses } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
  };
  const received = resolveReceivedDamage({
    amount: input.impact * matchup.impact,
    context,
    modifiers: input.received ?? [],
  });

  const resolution: DamageHitResolution = {
    channel: input.channel,
    impact: received.amount,
    immune: received.immune,
    matchup,
    received,
  };

  if (input.status !== undefined) {
    resolution.status = resolveStatusApplication({
      spec: input.status,
      scale: {
        applyChance: matchup.applyChance,
        magnitude: matchup.magnitude,
        duration: matchup.duration,
      },
      current: input.currentStatus ?? null,
      immunity: input.immunity ?? null,
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.rng !== undefined ? { rng: input.rng } : {}),
    });
  }

  return resolution;
}
