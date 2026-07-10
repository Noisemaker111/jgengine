export interface StreakTier {
  readonly minStreak: number;
  readonly multiplier: number;
  readonly label: string;
}

export const STREAK_TIERS: readonly StreakTier[] = [
  { minStreak: 0, multiplier: 1.0, label: "Loose Air" },
  { minStreak: 3, multiplier: 1.15, label: "Trimmed" },
  { minStreak: 6, multiplier: 1.3, label: "Laminar" },
  { minStreak: 9, multiplier: 1.45, label: "Glassy" },
  { minStreak: 12, multiplier: 1.6, label: "Mirror Core" },
  { minStreak: 16, multiplier: 1.8, label: "Perfect Lock" },
];

export function tierForStreak(streak: number): StreakTier {
  let best = STREAK_TIERS[0]!;
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minStreak) best = tier;
  }
  return best;
}
