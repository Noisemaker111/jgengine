// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
// @skill jgengine-gameplay
import { evaluatePredicate, type Predicate, type PredicateFacts } from "@jgengine/core/rules/predicate";
import type { ThresholdBoundary } from "@jgengine/core/threshold/thresholds";
import { createPacedSchedule, type PacedSchedule, type PacedScheduleState } from "@jgengine/core/time/pacedSchedule";

/** One difficulty of a summoned fight, a Ladder step (`at` is its place in the difficulty order): what the summon spends and what else it asks. */
export interface SummonTier extends ThresholdBoundary {
  /** Counted things the summon spends from the caller's source. */
  cost?: Readonly<Record<string, number>>;
  /** Anything else it asks, over the facts the caller passes to `check` and `summon`. */
  requirement?: Predicate;
}

/** Someone the portal could take in and where they stood to be sent back to. */
export interface SummonCandidate {
  id: string;
  /** What kind of party member this is; the caller names its own kinds and caps each in `partyCaps`. */
  kind: string;
  /** Where they stood when taken; they go back here. */
  at: readonly [number, number, number];
}

/** Where a summoned encounter stands: nothing summoned, the portal counting down, the fight, or the winners' wait. */
export type SummonedEncounterPhase = "idle" | "portal" | "fight" | "victory";

/** Serializable encounter state. */
export interface SummonedEncounterState {
  phase: SummonedEncounterPhase;
  tier: string | null;
  /** The clock that ends this phase (the portal or the winners' wait); null when nothing counts down. */
  deadline: PacedScheduleState | null;
  /** The fight's own time limit, when one is set; null otherwise. */
  limit: PacedScheduleState | null;
  /** Kind → ids taken in, in admission order. */
  party: Record<string, string[]>;
  /** Id → where it is sent back to. */
  returns: Record<string, readonly [number, number, number]>;
}

/** What a requirement check found: what the source is short of, and whether the rest of the requirement held. */
export interface SummonCheck {
  ok: boolean;
  missing: { item: string; need: number; have: number }[];
  requirementMet: boolean;
}

/** What the summoner carries, for a cost: how many of an item, and taking them. */
export interface CostSource {
  count(item: string): number;
  take(item: string, count: number): void;
}

/** Who goes back where, when a fight ends. */
export interface SummonReturn {
  id: string;
  kind: string;
  to: readonly [number, number, number];
}

/** A candidate the portal left behind, and why. */
export interface RefusedCandidate {
  id: string;
  reason: string;
}

/** Things that happened on one step of the encounter clock. */
export type SummonedEncounterEvent<C extends SummonCandidate> =
  /** The portal took everyone in range in; the game moves them and spawns the fight's target. */
  | { type: "entered"; tier: string; admitted: readonly C[]; refused: readonly RefusedCandidate[] }
  /** The portal closed with no lead kind in range: the cost is spent. */
  | { type: "closed"; tier: string }
  | { type: "won"; tier: string; party: Readonly<Record<string, readonly string[]>> }
  /** Every lead is gone, or time ran out: the party left inside is lost with the fight. */
  | { type: "lost"; tier: string; reason: "wiped" | "time"; party: Readonly<Record<string, readonly string[]>> }
  /** The winners' wait is over: send each back where they came from. */
  | { type: "returned"; tier: string; returns: readonly SummonReturn[] };

/** What the encounter clock asks the game each step. */
export interface SummonedEncounterHooks<C extends SummonCandidate> {
  /** Whether the fight's target still lives. */
  targetAlive(): boolean;
  /** Everyone in the portal's range right now: read when it closes. */
  gather(): readonly C[];
}

/** How a summoned fight runs: the tiers, the portal, who may come in, and how long the winners stay. */
export interface SummonedEncounterOptions {
  tiers: readonly SummonTier[];
  /** Seconds the portal counts down before it takes everyone in range. */
  portalSeconds: number;
  /** Most of each party kind one fight takes. A kind left out is never taken. */
  partyCaps: Readonly<Record<string, number>>;
  /** Party kind whose presence keeps the fight going: when none is left, the fight is lost. */
  lead: string;
  /** Seconds the winners stay before they are sent back. */
  victorySeconds: number;
  /** Seconds before an unfinished fight is lost. Omit for no limit. */
  timeLimitSeconds?: number;
}

/** What a summon did. */
export type SummonResult =
  | { ok: true }
  | { ok: false; reason: "busy" | "unknown" | "requirement"; check?: SummonCheck };

/** A fight started by meeting a requirement at a place, with its own time limit, outcome and trip home. */
export interface SummonedEncounter<C extends SummonCandidate> {
  /** Whether a summoner with these items and facts could summon `tier` now. */
  check(tier: string, have: (item: string) => number, facts?: PredicateFacts): SummonCheck;
  /** Take the cost and open the portal. Fails without taking anything when busy or a requirement is short. */
  summon(tier: string, from: CostSource, facts: PredicateFacts | undefined, now: number): SummonResult;
  /** Advance the clock. */
  tick(now: number, hooks: SummonedEncounterHooks<C>): SummonedEncounterEvent<C>[];
  /** Someone left the fight (died, went back): they are no longer sent back. */
  leave(id: string): void;
  /** Whether `id` is in the fight now. */
  inside(id: string): boolean;
  /** Seconds left on the portal, the winners' wait or the time limit; null when nothing counts down. */
  secondsLeft(now: number): number | null;
  state(): Readonly<SummonedEncounterState>;
  snapshot(): SummonedEncounterState;
  restore(state: SummonedEncounterState): void;
  reset(): void;
}

/** A one-shot deadline on the caller's clock: the `pacedSchedule` part with one event and no repeat. */
function deadlineAt(at: number): PacedSchedule {
  return createPacedSchedule({ firstAt: at, every: 0, count: 1 }, () => 0);
}

function restoreDeadline(state: PacedScheduleState | null): PacedSchedule | null {
  if (state === null) return null;
  const deadline = deadlineAt(state.nextAt);
  deadline.restore(state);
  return deadline;
}

function idle(): SummonedEncounterState {
  return { phase: "idle", tier: null, deadline: null, limit: null, party: {}, returns: {} };
}

function copyParty(party: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(party).map(([kind, ids]) => [kind, [...ids]]));
}

/**
 * A fight a game starts by meeting a requirement at a place: the summoner pays a tier's cost and its
 * extra condition, a portal counts down, then takes every candidate in range up to each kind's cap,
 * each remembered where they stood. The fight is won when the target dies, after which the winners
 * stay `victorySeconds` and are sent back; it is lost when no lead is left inside (or time runs out),
 * and the party still inside is lost with it. The game owns the bodies, teleports and the target;
 * this owns the rules and the clock. Deterministic in `now`; serializable.
 *
 * @capability summoned-encounter a fight started by meeting a cost at a place: a portal, party caps, win, wipe and the trip home
 */
export function createSummonedEncounter<C extends SummonCandidate>(options: SummonedEncounterOptions): SummonedEncounter<C> {
  const tiers = new Map(options.tiers.map((tier) => [tier.id, tier]));
  if (tiers.size !== options.tiers.length) throw new Error("summoned encounter tier ids must be unique");
  const { portalSeconds, partyCaps, lead, victorySeconds, timeLimitSeconds } = options;
  let state = idle();
  let deadline: PacedSchedule | null = null;
  let limit: PacedSchedule | null = null;

  function check(tierId: string, have: (item: string) => number, facts: PredicateFacts = {}): SummonCheck {
    const tier = tiers.get(tierId);
    if (tier === undefined) return { ok: false, missing: [], requirementMet: false };
    const missing = Object.entries(tier.cost ?? {})
      .map(([item, need]) => ({ item, need, have: have(item) }))
      .filter((entry) => entry.have < entry.need);
    const requirementMet = evaluatePredicate(tier.requirement, facts);
    return { ok: missing.length === 0 && requirementMet, missing, requirementMet };
  }

  function admit(candidates: readonly C[]): { admitted: C[]; refused: RefusedCandidate[] } {
    const admitted: C[] = [];
    const refused: RefusedCandidate[] = [];
    const taken = new Map<string, number>();
    for (const candidate of candidates) {
      const cap = partyCaps[candidate.kind];
      const count = taken.get(candidate.kind) ?? 0;
      if (cap === undefined || count >= cap) {
        refused.push({ id: candidate.id, reason: "full" });
        continue;
      }
      taken.set(candidate.kind, count + 1);
      admitted.push(candidate);
    }
    return { admitted, refused };
  }

  function due(clock: PacedSchedule | null, now: number): boolean {
    return clock !== null && clock.due(now).length > 0;
  }

  return {
    check,
    summon(tierId, from, facts, now) {
      if (state.phase !== "idle") return { ok: false, reason: "busy" };
      const tier = tiers.get(tierId);
      if (tier === undefined) return { ok: false, reason: "unknown" };
      const result = check(tierId, (item) => from.count(item), facts);
      if (!result.ok) return { ok: false, reason: "requirement", check: result };
      for (const [item, count] of Object.entries(tier.cost ?? {})) from.take(item, count);
      deadline = deadlineAt(now + portalSeconds);
      limit = null;
      state = { ...idle(), phase: "portal", tier: tierId, deadline: deadline.snapshot() };
      return { ok: true };
    },
    tick(now, hooks) {
      const tier = state.tier;
      if (tier === null) return [];
      if (state.phase === "portal" && (deadline === null || due(deadline, now))) {
        const { admitted, refused } = admit(hooks.gather());
        if (!admitted.some((candidate) => candidate.kind === lead)) {
          deadline = null;
          limit = null;
          state = idle();
          return [{ type: "closed", tier }];
        }
        const party: Record<string, string[]> = {};
        const returns: Record<string, readonly [number, number, number]> = {};
        for (const candidate of admitted) {
          const ids = party[candidate.kind] ?? [];
          ids.push(candidate.id);
          party[candidate.kind] = ids;
          returns[candidate.id] = [candidate.at[0], candidate.at[1], candidate.at[2]];
        }
        deadline = null;
        limit = timeLimitSeconds === undefined ? null : deadlineAt(now + timeLimitSeconds);
        state = { phase: "fight", tier, deadline: null, limit: limit === null ? null : limit.snapshot(), party, returns };
        return [{ type: "entered", tier, admitted, refused }];
      }
      if (state.phase === "fight") {
        if (!hooks.targetAlive()) {
          deadline = deadlineAt(now + victorySeconds);
          limit = null;
          state = { ...state, phase: "victory", deadline: deadline.snapshot(), limit: null };
          return [{ type: "won", tier, party: copyParty(state.party) }];
        }
        const timedOut = due(limit, now);
        if ((state.party[lead]?.length ?? 0) === 0 || timedOut) {
          const party = copyParty(state.party);
          deadline = null;
          limit = null;
          state = idle();
          return [{ type: "lost", tier, reason: timedOut ? "time" : "wiped", party }];
        }
        return [];
      }
      if (state.phase === "victory" && (deadline === null || due(deadline, now))) {
        const kinds = new Map<string, string>();
        for (const [kind, ids] of Object.entries(state.party)) for (const id of ids) kinds.set(id, kind);
        const returns: SummonReturn[] = [];
        for (const [id, kind] of kinds) {
          const to = state.returns[id];
          if (to !== undefined) returns.push({ id, kind, to });
        }
        deadline = null;
        state = idle();
        return [{ type: "returned", tier, returns }];
      }
      return [];
    },
    leave(id) {
      const party: Record<string, string[]> = {};
      for (const [kind, ids] of Object.entries(state.party)) party[kind] = ids.filter((entry) => entry !== id);
      state = {
        ...state,
        party,
        returns: Object.fromEntries(Object.entries(state.returns).filter(([entry]) => entry !== id)),
      };
    },
    inside(id) {
      if (state.phase !== "fight" && state.phase !== "victory") return false;
      return Object.values(state.party).some((ids) => ids.includes(id));
    },
    secondsLeft(now) {
      const clock = state.phase === "fight" ? limit : deadline;
      if (clock === null) return null;
      const remaining = clock.remaining(now);
      return remaining === undefined ? null : Math.max(0, remaining);
    },
    state: () => state,
    snapshot: () => structuredClone(state),
    restore(saved) {
      state = { ...idle(), ...structuredClone(saved) };
      deadline = restoreDeadline(state.deadline);
      limit = restoreDeadline(state.limit);
    },
    reset() {
      state = idle();
      deadline = null;
      limit = null;
    },
  };
}
