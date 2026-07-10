export interface PumpTier {
  id: string;
  label: string;
  minIntervalSec: number;
  maxIntervalSec: number;
  speedBonus: number;
}

export const PUMP_TIERS: readonly PumpTier[] = [
  { id: "perfect", label: "PERFECT PUMP", minIntervalSec: 0.42, maxIntervalSec: 0.58, speedBonus: 3.2 },
  { id: "good", label: "GOOD PUMP", minIntervalSec: 0.3, maxIntervalSec: 0.75, speedBonus: 1.6 },
  { id: "early", label: "TOO EARLY", minIntervalSec: 0, maxIntervalSec: 0.3, speedBonus: 0 },
  { id: "late", label: "TOO LATE", minIntervalSec: 0.75, maxIntervalSec: Number.POSITIVE_INFINITY, speedBonus: 0 },
];

const RANKED_TIERS = PUMP_TIERS.filter((tier) => tier.id !== "early" && tier.id !== "late");
const FALLBACK_TIER = PUMP_TIERS.find((tier) => tier.id === "late")!;

export function classifyPump(intervalSec: number): PumpTier {
  if (intervalSec < 0) return FALLBACK_TIER;
  for (const tier of RANKED_TIERS) {
    if (intervalSec >= tier.minIntervalSec && intervalSec <= tier.maxIntervalSec) return tier;
  }
  if (intervalSec < RANKED_TIERS[0]!.minIntervalSec) return PUMP_TIERS.find((tier) => tier.id === "early")!;
  return FALLBACK_TIER;
}

export function pumpSpeedBonus(intervalSec: number): number {
  return classifyPump(intervalSec).speedBonus;
}
