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

export interface RoundConfig<TPhase extends string = RoundPhase> {
  phases: Record<TPhase, number>;
  phaseOrder?: readonly TPhase[];
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

export interface RoundEvent<TPhase extends string = RoundPhase> {
  kind: RoundEventKind;
  round: number;
  phase?: TPhase;
  nextPhase?: TPhase;
  winner?: string;
  economy?: RoundEconomy[];
}

export type PhaseEndHook<TPhase extends string = RoundPhase> = (
  endingPhase: TPhase,
  nextPhase: TPhase,
  round: number,
) => void;

export interface RoundSnapshot<TPhase extends string = RoundPhase> {
  round: number;
  phase: TPhase;
  timeLeft: number;
  scores: Record<string, number>;
  lossStreaks: Record<string, number>;
  matchOver: boolean;
}

export interface RoundState<TPhase extends string = RoundPhase> {
  tick(dt: number): RoundEvent<TPhase>[];
  concludeRound(winner: string): RoundEvent<TPhase>[];
  onPhaseEnd(hook: PhaseEndHook<TPhase>): () => void;
  phase(): TPhase;
  round(): number;
  timeLeft(): number;
  score(team: string): number;
  economyFor(team: string): RoundEconomy;
  snapshot(): RoundSnapshot<TPhase>;
}

const DEFAULT_PHASE_ORDER: readonly RoundPhase[] = ["buy", "live", "end"];

export function lossBonusFor(rule: LossBonusRule | undefined, streak: number): number {
  if (rule === undefined) return 0;
  return Math.min(rule.max, rule.base + rule.step * Math.max(0, streak));
}

export function createRoundState(config: RoundConfig<RoundPhase>): RoundState<RoundPhase>;
export function createRoundState<TPhase extends string>(
  config: RoundConfig<TPhase> & { phaseOrder: readonly TPhase[] },
): RoundState<TPhase>;
export function createRoundState<TPhase extends string>(config: RoundConfig<TPhase>): RoundState<TPhase> {
  const durations = config.phases;
  const phaseOrder = (config.phaseOrder ?? (DEFAULT_PHASE_ORDER as unknown as readonly TPhase[]));
  const teams = config.teams.length > 0 ? [...config.teams] : ["a", "b"];
  const scores: Record<string, number> = {};
  const lossStreaks: Record<string, number> = {};
  for (const team of teams) {
    scores[team] = 0;
    lossStreaks[team] = 0;
  }

  let round = 1;
  let phase: TPhase = phaseOrder[0]!;
  let timeLeft = durations[phase];
  let matchOver = false;
  let pendingWinner: string | null = null;
  const hooks = new Set<PhaseEndHook<TPhase>>();

  function durationOf(next: TPhase): number {
    return durations[next];
  }

  function indexOf(current: TPhase): number {
    return phaseOrder.indexOf(current);
  }

  function nextPhaseOf(current: TPhase): TPhase {
    return phaseOrder[(indexOf(current) + 1) % phaseOrder.length]!;
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

  function enter(next: TPhase, events: RoundEvent<TPhase>[]): void {
    phase = next;
    timeLeft = durationOf(next);
    events.push({ kind: "phase.start", round, phase: next });
  }

  function endPhase(events: RoundEvent<TPhase>[]): void {
    const ending = phase;
    const isLast = indexOf(ending) === phaseOrder.length - 1;
    if (isLast) {
      if (config.maxRounds !== undefined && round >= config.maxRounds) {
        matchOver = true;
        const restart = phaseOrder[0]!;
        events.push({ kind: "phase.end", round, phase: ending, nextPhase: restart });
        events.push({ kind: "match.end", round });
        for (const hook of hooks) hook(ending, restart, round);
        return;
      }
      round += 1;
      pendingWinner = null;
    }
    const next = nextPhaseOf(ending);
    events.push({ kind: "phase.end", round: isLast ? round - 1 : round, phase: ending, nextPhase: next });
    for (const hook of hooks) hook(ending, next, isLast ? round - 1 : round);
    enter(next, events);
  }

  return {
    tick(dt) {
      if (dt <= 0 || matchOver) return [];
      const events: RoundEvent<TPhase>[] = [];
      timeLeft -= dt;
      let guard = 0;
      while (timeLeft <= 0 && !matchOver && guard < phaseOrder.length + 2) {
        const carry = timeLeft;
        if (indexOf(phase) !== phaseOrder.length - 1) pendingWinner = null;
        endPhase(events);
        if (!matchOver) timeLeft += carry;
        guard += 1;
      }
      return events;
    },
    concludeRound(winner) {
      if (matchOver || indexOf(phase) === 0) return [];
      const events: RoundEvent<TPhase>[] = [];
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
