export type Medal = "gold" | "silver" | "bronze" | "none";

export interface MedalThresholds {
  gold: number;
  silver: number;
  bronze: number;
}

export const DEFAULT_MEDAL_THRESHOLDS: MedalThresholds = {
  gold: 95,
  silver: 135,
  bronze: 185,
};

export function medalForTime(totalSeconds: number, thresholds: MedalThresholds = DEFAULT_MEDAL_THRESHOLDS): Medal {
  if (totalSeconds <= thresholds.gold) return "gold";
  if (totalSeconds <= thresholds.silver) return "silver";
  if (totalSeconds <= thresholds.bronze) return "bronze";
  return "none";
}
