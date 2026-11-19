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
} from "../statusApplication";

export interface DamageHitInput {
  channel: DamageChannelId;
  impact: number;
  target: string;
  source?: string;
  targetTraits?: readonly TargetTraitId[];
  targetStatuses?: readonly string[];
  tags?: readonly string[];
  matchup?: DamageMatchup;
  received?: readonly ReceivedModifier[];
  status?: StatusApplicationSpec;
  currentStatus?: StatusInstance | null;
  immunity?: StatusImmunity | null;
  /** Deterministic RNG for the status roll. Omitting it falls back to `Math.random` and warns once — pass `ctx.rng`. */
  rng?: () => number;
}

export interface DamageHitResolution {
  channel: DamageChannelId;
  impact: number;
  immune: boolean;
  matchup: ResolvedMatchup;
  received: ReceivedDamageResult;
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
