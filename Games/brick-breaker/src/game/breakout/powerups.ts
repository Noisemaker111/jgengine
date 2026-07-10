export type PowerupType = "multiball" | "wide" | "slow" | "life";

export interface PowerupDef {
  readonly type: PowerupType;
  readonly label: string;
  readonly glyph: string;
  readonly color: string;
  readonly name: string;
}

export const POWERUPS: Readonly<Record<PowerupType, PowerupDef>> = {
  multiball: { type: "multiball", label: "Multiball", glyph: "M", color: "#22d3ee", name: "Multiball" },
  wide: { type: "wide", label: "Wide Paddle", glyph: "W", color: "#4ade80", name: "Wide Paddle" },
  slow: { type: "slow", label: "Slow Ball", glyph: "S", color: "#fbbf24", name: "Slow Ball" },
  life: { type: "life", label: "Extra Life", glyph: "+", color: "#f472b6", name: "Extra Life" },
};

interface WeightedPowerup {
  readonly type: PowerupType;
  readonly weight: number;
}

const WEIGHTS: readonly WeightedPowerup[] = [
  { type: "multiball", weight: 3 },
  { type: "wide", weight: 3 },
  { type: "slow", weight: 3 },
  { type: "life", weight: 1 },
];

const TOTAL_WEIGHT = WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);

/** Pick a power-up type from a deterministic roll in [0, 1). */
export function pickPowerup(roll: number): PowerupType {
  let ticket = roll * TOTAL_WEIGHT;
  for (const entry of WEIGHTS) {
    ticket -= entry.weight;
    if (ticket < 0) return entry.type;
  }
  return WEIGHTS[WEIGHTS.length - 1]!.type;
}
