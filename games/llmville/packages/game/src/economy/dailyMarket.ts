export const DAILY_MODIFIER_TYPES = [
  "reasoning_demand_spike",
  "batch_bounty",
  "heat_wave",
  "off_peak_power",
  "frontier_release",
] as const;

export type DailyModifierType = (typeof DAILY_MODIFIER_TYPES)[number];

export interface DailyMarketModifier {
  type: DailyModifierType;
  label: string;
  description: string;
  revenueMult: number;
  dataYieldMult: number;
  ambientCoolingMult: number;
  electricityMult: number;
  frontierJump: number;
  /** When > 1, reasoning models use this instead of {@link revenueMult}. */
  reasoningRevenueMult: number;
}

export interface DailyMarketApplicableStats {
  revenuePerSecond: number;
  dataTokensPerSecond: number;
  ambientCoolingKw: number;
  electricityBillAmount: number;
}

const DAILY_MODIFIER_POOL: readonly DailyMarketModifier[] = [
  {
    type: "reasoning_demand_spike",
    label: "Reasoning demand spike",
    description: "Reasoning-model tokens pay 2× today.",
    revenueMult: 1,
    reasoningRevenueMult: 2,
    dataYieldMult: 1,
    ambientCoolingMult: 1,
    electricityMult: 1,
    frontierJump: 0,
  },
  {
    type: "batch_bounty",
    label: "Batch bounty",
    description: "Data-token yield +50% today.",
    revenueMult: 1,
    reasoningRevenueMult: 1,
    dataYieldMult: 1.5,
    ambientCoolingMult: 1,
    electricityMult: 1,
    frontierJump: 0,
  },
  {
    type: "heat_wave",
    label: "Heat wave",
    description: "Ambient cooling −30%, electricity +20%.",
    revenueMult: 1,
    reasoningRevenueMult: 1,
    dataYieldMult: 1,
    ambientCoolingMult: 0.7,
    electricityMult: 1.2,
    frontierJump: 0,
  },
  {
    type: "off_peak_power",
    label: "Off-peak power",
    description: "Electricity −40% today.",
    revenueMult: 1,
    reasoningRevenueMult: 1,
    dataYieldMult: 1,
    ambientCoolingMult: 1,
    electricityMult: 0.6,
    frontierJump: 0,
  },
  {
    type: "frontier_release",
    label: "Frontier release",
    description: "The global benchmark jumps; everyone's models decay a notch.",
    revenueMult: 1,
    reasoningRevenueMult: 1,
    dataYieldMult: 1,
    ambientCoolingMult: 1,
    electricityMult: 1,
    frontierJump: 5,
  },
] as const;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function formatDailyMarketDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Same modifier for every player on a given UTC calendar day. */
export function getDailyModifier(date: Date = new Date()): DailyMarketModifier {
  const seed = formatDailyMarketDateKey(date);
  const index = hashSeed(seed) % DAILY_MODIFIER_POOL.length;
  return DAILY_MODIFIER_POOL[index] ?? DAILY_MODIFIER_POOL[0]!;
}
