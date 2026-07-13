import type { FactionRelation } from "./factions";

export interface ReputationTier {
  id: string;
  min: number;
  relation: FactionRelation;
}

export const DEFAULT_REPUTATION_TIERS: readonly ReputationTier[] = [
  { id: "hated", min: -42000, relation: "hostile" },
  { id: "hostile", min: -6000, relation: "hostile" },
  { id: "unfriendly", min: -3000, relation: "neutral" },
  { id: "neutral", min: 0, relation: "neutral" },
  { id: "friendly", min: 3000, relation: "friendly" },
  { id: "honored", min: 9000, relation: "friendly" },
  { id: "revered", min: 21000, relation: "friendly" },
  { id: "exalted", min: 42000, relation: "friendly" },
];

/**
 * Map a faction standing value to its named reputation tier.
 *
 * @capability reputation faction standing that crosses named reputation tiers
 */
export function tierForStanding(tiers: readonly ReputationTier[], standing: number): ReputationTier {
  let match = tiers[0]!;
  for (const tier of tiers) {
    if (standing >= tier.min && tier.min >= match.min) match = tier;
  }
  return match;
}

export interface ReputationLedgerConfig {
  tiers?: readonly ReputationTier[];
  initial?: Readonly<Record<string, number>>;
  min?: number;
  max?: number;
}

export interface ReputationLedger {
  standing(actorId: string, factionId: string): number;
  hasStanding(actorId: string, factionId: string): boolean;
  gain(actorId: string, factionId: string, amount: number): number;
  set(actorId: string, factionId: string, standing: number): number;
  tier(actorId: string, factionId: string): ReputationTier;
  relation(actorId: string, factionId: string): FactionRelation;
  standings(actorId: string): Record<string, number>;
  reset(actorId: string, factionId?: string): void;
}

export function createReputationLedger(config: ReputationLedgerConfig = {}): ReputationLedger {
  const tiers = [...(config.tiers ?? DEFAULT_REPUTATION_TIERS)].sort((a, b) => a.min - b.min);
  const initial = config.initial ?? {};
  const min = config.min ?? Number.NEGATIVE_INFINITY;
  const max = config.max ?? Number.POSITIVE_INFINITY;
  const records = new Map<string, Map<string, number>>();

  function clamp(value: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function standing(actorId: string, factionId: string): number {
    const stored = records.get(actorId)?.get(factionId);
    if (stored !== undefined) return stored;
    return initial[factionId] ?? 0;
  }

  function store(actorId: string, factionId: string, value: number): number {
    const clamped = clamp(value);
    let row = records.get(actorId);
    if (row === undefined) {
      row = new Map();
      records.set(actorId, row);
    }
    row.set(factionId, clamped);
    return clamped;
  }

  return {
    standing,
    hasStanding(actorId, factionId) {
      return records.get(actorId)?.has(factionId) === true || initial[factionId] !== undefined;
    },
    gain(actorId, factionId, amount) {
      return store(actorId, factionId, standing(actorId, factionId) + amount);
    },
    set(actorId, factionId, value) {
      return store(actorId, factionId, value);
    },
    tier(actorId, factionId) {
      return tierForStanding(tiers, standing(actorId, factionId));
    },
    relation(actorId, factionId) {
      return tierForStanding(tiers, standing(actorId, factionId)).relation;
    },
    standings(actorId) {
      const out: Record<string, number> = { ...initial };
      const row = records.get(actorId);
      if (row !== undefined) for (const [factionId, value] of row) out[factionId] = value;
      return out;
    },
    reset(actorId, factionId) {
      if (factionId === undefined) records.delete(actorId);
      else records.get(actorId)?.delete(factionId);
    },
  };
}

export interface EffectiveRelationInput {
  base: FactionRelation;
  ledger: ReputationLedger;
  actorId: string;
  factionId: string;
}

export function effectiveRelation(input: EffectiveRelationInput): FactionRelation {
  if (input.ledger.hasStanding(input.actorId, input.factionId)) {
    return input.ledger.relation(input.actorId, input.factionId);
  }
  return input.base;
}
