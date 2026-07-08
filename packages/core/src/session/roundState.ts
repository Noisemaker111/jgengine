export type RoundPhase = string;

/** Default phase-duration shape for the built-in buy/live/end cycle; pass a wider `Record<string, number>` when using a custom `phaseOrder`. */
export interface RoundPhaseDurations {
  buy: number;
  live: number;
  end: number;
}

export interface LossBonusRule {
  base: number;
  step: number;
  max: number;
}

/** A team entry with an optional role tag (e.g. "attacker", "defender") retrievable via `RoundState.roleOf`. */
export interface RoundTeam {
  id: string;
  role?: string;
}

export interface RoundConfig {
  /** Duration in seconds for each phase name in `phaseOrder` (or the default `RoundPhaseDurations` shape). */
  phases: Record<string, number>;
  teams: readonly string[] | readonly RoundTeam[];
  /**
   * Overrides the default `["buy", "live", "end"]` cycle. Phases other than the first and last are
   * "conclude-eligible": `concludeRound`/`evaluate` may settle the round only while the current phase
   * is neither the first nor the last entry, matching the original buy (no conclude) / live (conclude) /
   * end (no conclude, settles the round) roles. The cycle wraps from the last entry back to the first.
   */
  phaseOrder?: readonly RoundPhase[];
  /** Evaluated by `evaluate()`; returning a team id concludes the round with that team as winner. */
  winCondition?: (state: RoundSnapshot) => string | null;
  maxRounds?: number;
  winReward?: number;
  lossBonus?: LossBonusRule;
}

export type RoundEventKind =
  | "phase.start"
  | "phase.end"
  | "round.win"
  | "round.economy"
  | "match.end";

export interface RoundEconomy {
  team: string;
  reward: number;
  won: boolean;
  lossStreak: number;
}

export interface RoundEvent {
  kind: RoundEventKind;
  round: number;
  phase?: RoundPhase;
  nextPhase?: RoundPhase;
  winner?: string;
  economy?: RoundEconomy[];
}

export type PhaseEndHook = (endingPhase: RoundPhase, nextPhase: RoundPhase, round: number) => void;

export interface RoundSnapshot {
  round: number;
  phase: RoundPhase;
  timeLeft: number;
  scores: Record<string, number>;
  lossStreaks: Record<string, number>;
  roles: Record<string, string | undefined>;
  matchOver: boolean;
}

export interface RoundState {
  tick(dt: number): RoundEvent[];
  concludeRound(winner: string): RoundEvent[];
  /** Calls `RoundConfig.winCondition` (a no-op when absent) and concludes the round if it returns a team id. */
  evaluate(): RoundEvent[];
  onPhaseEnd(hook: PhaseEndHook): () => void;
  phase(): RoundPhase;
  round(): number;
  timeLeft(): number;
  score(team: string): number;
  economyFor(team: string): RoundEconomy;
  /** The role tag configured for `team`, if any. */
  roleOf(team: string): string | undefined;
  snapshot(): RoundSnapshot;
}

const DEFAULT_PHASE_ORDER: readonly RoundPhase[] = ["buy", "live", "end"];

export function lossBonusFor(rule: LossBonusRule | undefined, streak: number): number {
  if (rule === undefined) return 0;
  return Math.min(rule.max, rule.base + rule.step * Math.max(0, streak));
}

function normalizeTeams(teams: RoundConfig["teams"]): readonly RoundTeam[] {
  if (teams.length === 0) return [{ id: "a" }, { id: "b" }];
  const normalized: RoundTeam[] = [];
  for (const team of teams) {
    normalized.push(typeof team === "string" ? { id: team } : team);
  }
  return normalized;
}

function isConcludable(order: readonly RoundPhase[], phase: RoundPhase): boolean {
  const idx = order.indexOf(phase);
  return idx > 0 && idx < order.length - 1;
}

export function createRoundState(config: RoundConfig): RoundState {
  const order = config.phaseOrder ?? DEFAULT_PHASE_ORDER;
  const durations = config.phases;
  const teamRecords = normalizeTeams(config.teams);
  const teamIds = teamRecords.map((t) => t.id);
  const roles: Record<string, string | undefined> = {};
  const scores: Record<string, number> = {};
  const lossStreaks: Record<string, number> = {};
  for (const team of teamRecords) {
    roles[team.id] = team.role;
    scores[team.id] = 0;
    lossStreaks[team.id] = 0;
  }

  let round = 1;
  let phase: RoundPhase = order[0]!;
  let timeLeft = durations[phase] ?? 0;
  let matchOver = false;
  let pendingWinner: string | null = null;
  const hooks = new Set<PhaseEndHook>();

  function durationOf(next: RoundPhase): number {
    return durations[next] ?? 0;
  }

  function nextPhaseOf(current: RoundPhase): RoundPhase {
    const idx = order.indexOf(current);
    return idx >= order.length - 1 ? order[0]! : order[idx + 1]!;
  }

  function economyFor(team: string): RoundEconomy {
    const won = pendingWinner === team;
    return {
      team,
      reward: won ? config.winReward ?? 0 : lossBonusFor(config.lossBonus, lossStreaks[team]!),
      won,
      lossStreak: lossStreaks[team]!,
    };
  }

  function settleEconomy(winner: string): RoundEconomy[] {
    const economy: RoundEconomy[] = [];
    for (const team of teamIds) {
      const won = team === winner;
      const reward = won ? config.winReward ?? 0 : lossBonusFor(config.lossBonus, lossStreaks[team]!);
      economy.push({ team, reward, won, lossStreak: lossStreaks[team]! });
    }
    for (const team of teamIds) {
      if (team === winner) lossStreaks[team] = 0;
      else lossStreaks[team]! += 1;
    }
    return economy;
  }

  function enter(next: RoundPhase, events: RoundEvent[]): void {
    phase = next;
    timeLeft = durationOf(next);
    events.push({ kind: "phase.start", round, phase: next });
  }

  function endPhase(events: RoundEvent[]): void {
    const ending = phase;
    if (ending === order[order.length - 1]) {
      if (config.maxRounds !== undefined && round >= config.maxRounds) {
        matchOver = true;
        events.push({ kind: "phase.end", round, phase: ending, nextPhase: order[0]! });
        events.push({ kind: "match.end", round });
        for (const hook of hooks) hook(ending, order[0]!, round);
        return;
      }
      round += 1;
      pendingWinner = null;
    }
    const next = nextPhaseOf(ending);
    const endedRound = ending === order[order.length - 1] ? round - 1 : round;
    events.push({ kind: "phase.end", round: endedRound, phase: ending, nextPhase: next });
    for (const hook of hooks) hook(ending, next, endedRound);
    enter(next, events);
  }

  function currentSnapshot(): RoundSnapshot {
    return {
      round,
      phase,
      timeLeft: Math.max(0, timeLeft),
      scores: { ...scores },
      lossStreaks: { ...lossStreaks },
      roles: { ...roles },
      matchOver,
    };
  }

  function concludeRoundImpl(winner: string): RoundEvent[] {
    if (matchOver || !isConcludable(order, phase)) return [];
    const events: RoundEvent[] = [];
    pendingWinner = winner;
    scores[winner] = (scores[winner] ?? 0) + 1;
    events.push({ kind: "round.win", round, winner });
    const economy = settleEconomy(winner);
    events.push({ kind: "round.economy", round, winner, economy });
    endPhase(events);
    return events;
  }

  return {
    tick(dt) {
      if (dt <= 0 || matchOver) return [];
      const events: RoundEvent[] = [];
      timeLeft -= dt;
      let guard = 0;
      while (timeLeft <= 0 && !matchOver && guard < order.length + 2) {
        const carry = timeLeft;
        if (isConcludable(order, phase)) pendingWinner = null;
        endPhase(events);
        if (!matchOver) timeLeft += carry;
        guard += 1;
      }
      return events;
    },
    concludeRound: concludeRoundImpl,
    evaluate() {
      if (config.winCondition === undefined) return [];
      const winner = config.winCondition(currentSnapshot());
      return winner === null ? [] : concludeRoundImpl(winner);
    },
    onPhaseEnd(hook) {
      hooks.add(hook);
      return () => {
        hooks.delete(hook);
      };
    },
    phase: () => phase,
    round: () => round,
    timeLeft: () => Math.max(0, timeLeft),
    score: (team) => scores[team] ?? 0,
    economyFor,
    roleOf: (team) => roles[team],
    snapshot: currentSnapshot,
  };
}
