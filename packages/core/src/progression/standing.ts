import {
  createReputationLedger,
  DEFAULT_REPUTATION_TIERS,
  type ReputationLedger,
  type ReputationTier,
} from "../faction/reputation";

/** One standing track: a faction, a district, a licence board — whatever an authored outcome moves. */
export interface StandingTrackDef {
  id: string;
  label?: string;
  /** Tiers this track crosses, ascending by `min`; defaults to the shared reputation ladder. */
  tiers?: readonly ReputationTier[];
  /** Standing every actor starts at (default `0`). */
  initial?: number;
  /** Floor and ceiling; omitted means unbounded. */
  min?: number;
  max?: number;
}

/** One outcome a game can report, and the standing it moves on each track. */
export interface StandingOutcomeDef {
  id: string;
  label?: string;
  /** Track id → signed standing. A negative number is the fall. */
  impacts: Readonly<Record<string, number>>;
}

/** Authored standing content: the tracks an actor stands with, and the outcomes that move them. */
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

/** A threshold on one track, as an unlock or an upgrade reads it. */
export interface StandingRequirement {
  trackId: string;
  /** Smallest standing that passes; omitted means no floor. */
  min?: number;
  /** Largest standing that passes; omitted means no ceiling. */
  max?: number;
}

/** Plain JSON state of a {@link Standing}; tracks left at their authored `initial` are absent. */
export interface StandingState {
  records: Record<string, Record<string, number>>;
}

/**
 * Live standing over authored tracks, moved by named outcomes or direct adjustments, with the
 * tier on each track and a serializable snapshot.
 */
export interface Standing {
  tracks(): readonly StandingTrackDef[];
  hasTrack(trackId: string): boolean;
  hasOutcome(outcomeId: string): boolean;
  standing(actorId: string, trackId: string): number;
  tier(actorId: string, trackId: string): ReputationTier;
  /** Every track's standing for one actor, authored tracks included at their initial value. */
  standings(actorId: string): Record<string, number>;
  /** Apply an authored outcome; returns each track it moved. Throws on an unknown outcome id. */
  apply(actorId: string, outcomeId: string): readonly StandingChange[];
  /** Move one track directly; returns the change. Throws on an unknown track id. */
  adjust(actorId: string, trackId: string, delta: number): StandingChange;
  meets(actorId: string, requirement: StandingRequirement): boolean;
  snapshot(): StandingState;
  restore(next: StandingState): void;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** Check authored standing content before use; throws `RangeError` naming the offending field. */
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
    const tiers = track.tiers ?? DEFAULT_REPUTATION_TIERS;
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

/**
 * Per-faction or per-district standing that rises and falls from named outcomes, over authored
 * tracks. Numbers live in the shared reputation ledger (`faction/reputation`); this adds the
 * authored outcome table, tier-per-track and the one snapshot a save stores. An outcome id or
 * track id that resolves to nothing throws at the call, so authored content fails loudly.
 *
 * @capability standing per-track standing moved by authored outcomes, with tiers and one snapshot
 */
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
        tiers: track.tiers ?? DEFAULT_REPUTATION_TIERS,
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
    meets(actorId, requirement) {
      const value = ledgerFor(requirement.trackId).standing(actorId, requirement.trackId);
      return (requirement.min === undefined || value >= requirement.min) && (requirement.max === undefined || value <= requirement.max);
    },
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
