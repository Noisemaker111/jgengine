import { foldStatContributions, type StatContribution } from "@jgengine/core/progression/statGraph";
import { pickKeyed } from "@jgengine/core/random/pick";
import { hashString } from "@jgengine/core/random/rng";

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

/** The market numbers a daily modifier stacks onto. */
type DailyMarketStat = Exclude<keyof DailyMarketModifier, "type" | "label" | "description">;

/** Every market number before a day's modifier: multipliers at 1, the frontier jump at 0. */
const DAILY_MARKET_BASE: Readonly<Record<DailyMarketStat, number>> = {
  revenueMult: 1,
  reasoningRevenueMult: 1,
  dataYieldMult: 1,
  ambientCoolingMult: 1,
  electricityMult: 1,
  frontierJump: 0,
};

interface DailyMarketEntry {
  type: DailyModifierType;
  label: string;
  description: string;
  effects: Partial<Record<DailyMarketStat, readonly StatContribution[]>>;
}

/** The day's table: one entry per modifier, each a stack of Modifiers on the market numbers. */
const DAILY_MARKET_TABLE: readonly DailyMarketEntry[] = [
  {
    type: "reasoning_demand_spike",
    label: "Reasoning demand spike",
    description: "Reasoning-model tokens pay 2× today.",
    effects: { reasoningRevenueMult: [{ source: "reasoning_demand_spike", op: "mul", value: 2 }] },
  },
  {
    type: "batch_bounty",
    label: "Batch bounty",
    description: "Data-token yield +50% today.",
    effects: { dataYieldMult: [{ source: "batch_bounty", op: "mul", value: 1.5 }] },
  },
  {
    type: "heat_wave",
    label: "Heat wave",
    description: "Ambient cooling −30%, electricity +20%.",
    effects: {
      ambientCoolingMult: [{ source: "heat_wave", op: "mul", value: 0.7 }],
      electricityMult: [{ source: "heat_wave", op: "mul", value: 1.2 }],
    },
  },
  {
    type: "off_peak_power",
    label: "Off-peak power",
    description: "Electricity −40% today.",
    effects: { electricityMult: [{ source: "off_peak_power", op: "mul", value: 0.6 }] },
  },
  {
    type: "frontier_release",
    label: "Frontier release",
    description: "The global benchmark jumps; everyone's models decay a notch.",
    effects: { frontierJump: [{ source: "frontier_release", op: "add", value: 5 }] },
  },
];

function resolveDailyMarketEntry(entry: DailyMarketEntry): DailyMarketModifier {
  const stat = (id: DailyMarketStat): number => foldStatContributions(DAILY_MARKET_BASE[id], entry.effects[id] ?? []);
  return {
    type: entry.type,
    label: entry.label,
    description: entry.description,
    revenueMult: stat("revenueMult"),
    reasoningRevenueMult: stat("reasoningRevenueMult"),
    dataYieldMult: stat("dataYieldMult"),
    ambientCoolingMult: stat("ambientCoolingMult"),
    electricityMult: stat("electricityMult"),
    frontierJump: stat("frontierJump"),
  };
}

const DAILY_MODIFIER_POOL: readonly DailyMarketModifier[] = DAILY_MARKET_TABLE.map(resolveDailyMarketEntry);

export function formatDailyMarketDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Same modifier for every player on a given UTC calendar day. */
export function getDailyModifier(date: Date = new Date()): DailyMarketModifier {
  const seed = formatDailyMarketDateKey(date);
  const picked = pickKeyed(hashString(seed), DAILY_MODIFIER_POOL);
  if (picked === undefined) throw new Error("daily market table is empty");
  return picked;
}
