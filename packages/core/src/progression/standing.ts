import { evaluatePredicate, predicateLeaves, type Predicate } from "../rules/predicate";
import {
  createReputationLedger,
  type ReputationLedger,
  type ReputationTier,
} from "../faction/reputation";

export interface StandingTrackDef {
  id: string;
  label?: string;
  tiers: readonly ReputationTier[];
  initial?: number;
  min?: number;
  max?: number;
}

export interface StandingOutcomeDef {
  id: string;
  label?: string;
  impacts: Readonly<Record<string, number>>;
}

export interface StandingConfig {
  tracks: readonly StandingTrackDef[];
  outcomes?: readonly StandingOutcomeDef[];
}

/** One track's movement, with the tier on both sides so a caller can announce a crossing. */
export interface StandingChange {
  trackId: string;
  before: number;
  after: number;
  delta: number;
  previousTier: string;
  tier: string;
}

/** @capability standing read per-track standing in gates, upgrades and other predicates */
export function standingTracksRead(predicate: Predicate | undefined): string[] {
  const tracks: string[] = [];
  for (const leaf of predicateLeaves(predicate)) {
    if (leaf.path.startsWith("standing.")) tracks.push(leaf.path.slice("standing.".length));
  }
  return tracks;
}

/** @capability standing read per-track standing in gates, upgrades and other predicates */
export function evaluateStandingPredicate(
  predicate: Predicate | undefined,
  reader: Pick<Standing, "standing">,
  actorId: string,
): boolean {
  const standing: Record<string, number> = {};
  for (const trackId of standingTracksRead(predicate)) standing[trackId] = reader.standing(actorId, trackId);
  return evaluatePredicate(predicate, { standing });
}

export interface StandingState {
  records: Record<string, Record<string, number>>;
}

export interface Standing {
  tracks(): readonly StandingTrackDef[];
  hasTrack(trackId: string): boolean;
  hasOutcome(outcomeId: string): boolean;
  standing(actorId: string, trackId: string): number;
  tier(actorId: string, trackId: string): ReputationTier;
  standings(actorId: string): Record<string, number>;
  apply(actorId: string, outcomeId: string): readonly StandingChange[];
  adjust(actorId: string, trackId: string, delta: number): StandingChange;
  meets(actorId: string, requirement: Predicate): boolean;
  snapshot(): StandingState;
  restore(next: StandingState): void;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function assertStandingConfig(config: StandingConfig): void {
  const trackIds = new Set<string>();
  for (const track of config.tracks) {
    const id = track.id.trim();
    check(id !== "", "Standing track id must not be empty");
    check(!trackIds.has(id), `Standing track "${id}" is declared twice`);
    trackIds.add(id);
    if (track.min !== undefined) check(isFiniteNumber(track.min), `Standing track "${id}" min must be finite`);
    if (track.max !== undefined) check(isFiniteNumber(track.max), `Standing track "${id}" max must be finite`);
    check(
      track.min === undefined || track.max === undefined || track.min <= track.max,
      `Standing track "${id}" needs min <= max`,
    );
    if (track.initial !== undefined) {
      check(isFiniteNumber(track.initial), `Standing track "${id}" initial must be finite`);
      check(
        (track.min === undefined || track.initial >= track.min) && (track.max === undefined || track.initial <= track.max),
        `Standing track "${id}" initial ${track.initial} is outside its bounds`,
      );
    }
    const tiers = track.tiers;
    check(tiers.length > 0, `Standing track "${id}" needs at least one tier`);
    const tierIds = new Set<string>();
    for (const tier of tiers) {
      check(tier.id.trim() !== "", `Standing track "${id}" has a tier with an empty id`);
      check(!tierIds.has(tier.id), `Standing track "${id}" declares tier "${tier.id}" twice`);
      check(isFiniteNumber(tier.min), `Standing track "${id}" tier "${tier.id}" min must be finite`);
      tierIds.add(tier.id);
    }
  }
  const outcomeIds = new Set<string>();
  for (const outcome of config.outcomes ?? []) {
    const id = outcome.id.trim();
    check(id !== "", "Standing outcome id must not be empty");
    check(!outcomeIds.has(id), `Standing outcome "${id}" is declared twice`);
    outcomeIds.add(id);
    const impacts = Object.entries(outcome.impacts);
    check(impacts.length > 0, `Standing outcome "${id}" moves no track`);
    for (const [trackId, delta] of impacts) {
      check(trackIds.has(trackId), `Standing outcome "${id}" names unknown track "${trackId}"`);
      check(isFiniteNumber(delta), `Standing outcome "${id}" impact on "${trackId}" must be finite`);
    }
  }
}

/** @capability standing per-track standing moved by authored outcomes, with tiers and one snapshot */
export function createStanding(config: StandingConfig): Standing {
  assertStandingConfig(config);
  const tracks = new Map<string, StandingTrackDef>();
  for (const track of config.tracks) tracks.set(track.id, track);
  const outcomes = new Map<string, StandingOutcomeDef>();
  for (const outcome of config.outcomes ?? []) outcomes.set(outcome.id, outcome);

  const ledgers = new Map<string, ReputationLedger>();
  for (const track of config.tracks) {
    ledgers.set(
      track.id,
      createReputationLedger({
        tiers: track.tiers,
        initial: { [track.id]: track.initial ?? 0 },
        ...(track.min === undefined ? {} : { min: track.min }),
        ...(track.max === undefined ? {} : { max: track.max }),
      }),
    );
  }

  function ledgerFor(trackId: string): ReputationLedger {
    const ledger = ledgers.get(trackId);
    if (ledger === undefined) throw new RangeError(`Standing track "${trackId}" is not authored`);
    return ledger;
  }

  return {
    tracks: () => config.tracks.slice(),
    hasTrack: (trackId) => tracks.has(trackId),
    hasOutcome: (outcomeId) => outcomes.has(outcomeId),
    standing(actorId, trackId) {
      return ledgerFor(trackId).standing(actorId, trackId);
    },
    tier: (actorId, trackId) => ledgerFor(trackId).tier(actorId, trackId),
    standings(actorId) {
      const out: Record<string, number> = {};
      for (const trackId of ledgers.keys()) out[trackId] = ledgerFor(trackId).standing(actorId, trackId);
      return out;
    },
    apply(actorId, outcomeId) {
      const outcome = outcomes.get(outcomeId);
      if (outcome === undefined) throw new RangeError(`Standing outcome "${outcomeId}" is not authored`);
      const changes: StandingChange[] = [];
      for (const [trackId, delta] of Object.entries(outcome.impacts)) {
        const ledger = ledgerFor(trackId);
        const before = ledger.standing(actorId, trackId);
        const previousTier = ledger.tier(actorId, trackId).id;
        ledger.gain(actorId, trackId, delta);
        const after = ledger.standing(actorId, trackId);
        changes.push({ trackId, before, after, delta: after - before, previousTier, tier: ledger.tier(actorId, trackId).id });
      }
      return changes;
    },
    adjust(actorId, trackId, delta) {
      const ledger = ledgerFor(trackId);
      const before = ledger.standing(actorId, trackId);
      const previousTier = ledger.tier(actorId, trackId).id;
      ledger.gain(actorId, trackId, delta);
      const after = ledger.standing(actorId, trackId);
      return { trackId, before, after, delta: after - before, previousTier, tier: ledger.tier(actorId, trackId).id };
    },
    meets: (actorId, requirement) => evaluateStandingPredicate(requirement, { standing: (id, trackId) => ledgerFor(trackId).standing(id, trackId) }, actorId),
    snapshot() {
      const records: Record<string, Record<string, number>> = {};
      for (const [trackId, ledger] of ledgers) {
        for (const [actorId, row] of Object.entries(ledger.snapshot().records)) {
          const target = records[actorId] ?? (records[actorId] = {});
          const value = row[trackId];
          if (value !== undefined) target[trackId] = value;
        }
      }
      return { records };
    },
    restore(next) {
      const byTrack = new Map<string, Record<string, Record<string, number>>>();
      for (const [actorId, row] of Object.entries(next.records ?? {})) {
        for (const [trackId, value] of Object.entries(row)) {
          if (!ledgers.has(trackId) || !isFiniteNumber(value)) continue;
          const target = byTrack.get(trackId);
          if (target === undefined) byTrack.set(trackId, { [actorId]: { [trackId]: value } });
          else target[actorId] = { [trackId]: value };
        }
      }
      for (const [trackId, ledger] of ledgers) ledger.restore({ records: byTrack.get(trackId) ?? {} });
    },
  };
}
