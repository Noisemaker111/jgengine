export const EVENT_SPAWN_COOLDOWN_MS = 120_000;

export interface CozyEventDefinition {
  type: string;
  description: string;
}

export const EVENT_REWARD_BASE = 15;
export const EVENT_REWARD_INCOME_SHARE = 0.1;
export const EVENT_REWARD_MIN = 15;
export const EVENT_REWARD_MAX = 250;

export function computeCozyEventReward(servingIncomePerHour: number): number {
  const scaled = Math.round(Math.max(0, servingIncomePerHour) * EVENT_REWARD_INCOME_SHARE) + EVENT_REWARD_BASE;
  return Math.min(EVENT_REWARD_MAX, Math.max(EVENT_REWARD_MIN, scaled));
}

export const COZY_EVENTS: readonly CozyEventDefinition[] = [
  { type: "new_chip_drop", description: "Nvidia dropped the next Blackwell. Write the hype thread and ride the wave." },
  { type: "price_war", description: "API price war — every lab slashed $/token. Undercut them and post about it." },
  { type: "benchmark_hype", description: "Your model topped a niche benchmark. Screenshot the leaderboard before it rotates." },
  { type: "quant_breakthrough", description: "A new FP4 kernel landed — quantized models got faster overnight. Cash the goodwill." },
  { type: "gpu_shortage", description: "GPU shortage. Resell a spare allocation at a (totally reasonable) markup." },
  { type: "export_controls", description: "Export controls reshuffled the market. Arbitrage the gray market — legally." },
  { type: "open_weights_drop", description: "A lab open-sourced a strong model. Fine-tune and ship before the hype fades." },
  { type: "agent_demo_viral", description: "Your agent demo went viral on tech Twitter. Sponsorships roll in." },
  { type: "thermal_scare", description: "Heat wave hit the datacenter. You kept it cool and billed for the uptime." },
  { type: "data_deal", description: "Signed a data licensing deal. Fresh tokens, fresh revenue." },
] as const;

export type CozyEventSpawnDecision =
  | { kind: "skip" }
  | { kind: "spawn"; event: CozyEventDefinition; rewardMoney: number };

export interface CozyEventSpawnInputs {
  hasUnresolvedEvent: boolean;
  lastEventSpawnAt: number;
  now: number;
  /** Uniform draw in [0, 1) selecting which cozy event fires. */
  rngUnit: number;
  servingIncomePerHour: number;
}

export function decideCozyEventSpawn(input: CozyEventSpawnInputs): CozyEventSpawnDecision {
  if (input.hasUnresolvedEvent || input.now - input.lastEventSpawnAt < EVENT_SPAWN_COOLDOWN_MS) {
    return { kind: "skip" };
  }
  const index = Math.min(
    COZY_EVENTS.length - 1,
    Math.floor(input.rngUnit * COZY_EVENTS.length),
  );
  return {
    kind: "spawn",
    event: COZY_EVENTS[index]!,
    rewardMoney: computeCozyEventReward(input.servingIncomePerHour),
  };
}
