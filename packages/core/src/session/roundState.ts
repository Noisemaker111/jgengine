export type RoundPhase = "buy" | "live" | "end";

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

export interface RoundConfig {
  phases: RoundPhaseDurations;
  teams: readonly string[];
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
  matchOver: boolean;
}

export interface RoundState {
  tick(dt: number): RoundEvent[];
  concludeRound(winner: string): RoundEvent[];
  onPhaseEnd(hook: PhaseEndHook): () => void;
  phase(): RoundPhase;
  round(): number;
  timeLeft(): number;
  score(team: string): number;
  economyFor(team: string): RoundEconomy;
  snapshot(): RoundSnapshot;
}

const PHASE_ORDER: RoundPhase[] = ["buy", "live", "end"];

export function lossBonusFor(rule: LossBonusRule | undefined, streak: number): number {
  if (rule === undefined) return 0;
  return Math.min(rule.max, rule.base + rule.step * Math.max(0, streak));
}

export function createRoundState(config: RoundConfig): RoundState {
  const durations = config.phases;
  const teams = config.teams.length > 0 ? [...config.teams] : ["a", "b"];
  const scores: Record<string, number> = {};
  const lossStreaks: Record<string, number> = {};
  for (const team of teams) {
    scores[team] = 0;
    lossStreaks[team] = 0;
  }

  let round = 1;
  let phase: RoundPhase = "buy";
  let timeLeft = durations.buy;
  let matchOver = false;
  let pendingWinner: string | null = null;
  const hooks = new Set<PhaseEndHook>();

  function durationOf(next: RoundPhase): number {
    return durations[next];
  }

  function nextPhaseOf(current: RoundPhase): RoundPhase {
    if (current === "end") return "buy";
    return PHASE_ORDER[PHASE_ORDER.indexOf(current) + 1]!;
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
    for (const team of teams) {
      const won = team === winner;
      const reward = won ? config.winReward ?? 0 : lossBonusFor(config.lossBonus, lossStreaks[team]!);
      economy.push({ team, reward, won, lossStreak: lossStreaks[team]! });
    }
    for (const team of teams) {
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
    if (ending === "end") {
      if (config.maxRounds !== undefined && round >= config.maxRounds) {
        matchOver = true;
        events.push({ kind: "phase.end", round, phase: ending, nextPhase: "buy" });
        events.push({ kind: "match.end", round });
        for (const hook of hooks) hook(ending, "buy", round);
        return;
      }
      round += 1;
      pendingWinner = null;
    }
    const next = nextPhaseOf(ending);
    events.push({ kind: "phase.end", round: ending === "end" ? round - 1 : round, phase: ending, nextPhase: next });
    for (const hook of hooks) hook(ending, next, ending === "end" ? round - 1 : round);
    enter(next, events);
  }

  return {
    tick(dt) {
      if (dt <= 0 || matchOver) return [];
      const events: RoundEvent[] = [];
      timeLeft -= dt;
      let guard = 0;
      while (timeLeft <= 0 && !matchOver && guard < PHASE_ORDER.length + 2) {
        const carry = timeLeft;
        if (phase === "live") pendingWinner = null;
        endPhase(events);
        if (!matchOver) timeLeft += carry;
        guard += 1;
      }
      return events;
    },
    concludeRound(winner) {
      if (matchOver || phase !== "live") return [];
      const events: RoundEvent[] = [];
      pendingWinner = winner;
      scores[winner] = (scores[winner] ?? 0) + 1;
      events.push({ kind: "round.win", round, winner });
      const economy = settleEconomy(winner);
      events.push({ kind: "round.economy", round, winner, economy });
      endPhase(events);
      return events;
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
    snapshot: () => ({
      round,
      phase,
      timeLeft: Math.max(0, timeLeft),
      scores: { ...scores },
      lossStreaks: { ...lossStreaks },
      matchOver,
    }),
  };
}
