/**
 * Caller-owned id for a damage channel — `"fire"`, `"ballistic"`, `"physical"`, `"corrosive"`.
 * The engine never branches on the value; a channel is whatever a game's data declares.
 */
export type DamageChannelId = string;

export type TargetTraitId = string;

/**
 * The independent, typed outputs a channel-vs-trait matchup can scale. Every field is an
 * optional multiplier that defaults to `1` (identity), so a matchup entry names only the axes
 * it bends. `impact` scales the direct hit, `applyChance` the odds a status lands, `magnitude`
 * and `duration` the applied status itself, and `extra` carries any further caller-defined
 * scalar (knockback, stagger, heat) the engine forwards without interpreting.
 */
export interface MatchupOutputs {
  impact?: number;
  applyChance?: number;
  magnitude?: number;
  duration?: number;
  extra?: Record<string, number>;
}

export interface DamageMatchup<
  TChannel extends string = DamageChannelId,
  TTrait extends string = TargetTraitId,
> {
  entries: Partial<Record<TChannel, Partial<Record<TTrait, MatchupOutputs>>>>;
  /** Outputs used when no listed trait matches the channel; identity when omitted. */
  default?: MatchupOutputs;
}

export interface MatchupContribution {
  trait: TargetTraitId;
  outputs: MatchupOutputs;
}

export interface ResolvedMatchup {
  channel: DamageChannelId;
  impact: number;
  applyChance: number;
  magnitude: number;
  duration: number;
  /** Extra scalar outputs, each defaulting to 1 unless a contribution set it. */
  extra: Record<string, number>;
  matched: boolean;
  contributions: MatchupContribution[];
}

function multiplyInto(
  acc: { impact: number; applyChance: number; magnitude: number; duration: number; extra: Record<string, number> },
  outputs: MatchupOutputs,
): void {
  if (outputs.impact !== undefined) acc.impact *= outputs.impact;
  if (outputs.applyChance !== undefined) acc.applyChance *= outputs.applyChance;
  if (outputs.magnitude !== undefined) acc.magnitude *= outputs.magnitude;
  if (outputs.duration !== undefined) acc.duration *= outputs.duration;
  if (outputs.extra !== undefined) {
    for (const [key, value] of Object.entries(outputs.extra)) {
      acc.extra[key] = (acc.extra[key] ?? 1) * value;
    }
  }
}

/**
 * Resolve a channel against a target's traits into independent, multiplied outputs. Pure and
 * order-independent: every trait the channel has an entry for contributes, its axes multiplying
 * into the running product; unmatched traits are skipped, and when nothing matches the table's
 * `default` (or identity) is used. Bounded by the trait count — no world scan.
 *
 * @capability damage-matchup score a data-defined damage channel against a target's traits into independent typed multipliers
 */
export function resolveMatchup<
  TChannel extends string = DamageChannelId,
  TTrait extends string = TargetTraitId,
>(
  matchup: DamageMatchup<TChannel, TTrait>,
  channel: TChannel | string,
  targetTraits: readonly (TTrait | string)[],
): ResolvedMatchup {
  const acc = { impact: 1, applyChance: 1, magnitude: 1, duration: 1, extra: {} as Record<string, number> };
  const contributions: MatchupContribution[] = [];
  const byTrait = matchup.entries[channel as TChannel];
  if (byTrait !== undefined) {
    for (const trait of targetTraits) {
      const outputs = byTrait[trait as TTrait];
      if (outputs === undefined) continue;
      multiplyInto(acc, outputs);
      contributions.push({ trait, outputs });
    }
  }
  const matched = contributions.length > 0;
  if (!matched && matchup.default !== undefined) {
    multiplyInto(acc, matchup.default);
  }
  return { channel, ...acc, matched, contributions };
}
