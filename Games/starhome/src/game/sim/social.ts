export interface RelMilestone {
  at: number;
  key: string;
  label: string;
}

export const REL_MILESTONES: RelMilestone[] = [
  { at: 35, key: "friends", label: "became friends" },
  { at: 70, key: "close", label: "grew close" },
  { at: 95, key: "bonded", label: "formed a lifelong bond" },
];

export function clampRel(value: number): number {
  return value < -100 ? -100 : value > 100 ? 100 : value;
}

export function relationLabel(value: number): string {
  if (value >= 95) return "Bonded";
  if (value >= 70) return "Close";
  if (value >= 35) return "Friends";
  if (value >= 10) return "Warm";
  if (value > -10) return "Neutral";
  if (value > -40) return "Tense";
  return "Rivals";
}

export function crossedMilestone(before: number, after: number): RelMilestone | null {
  for (const milestone of REL_MILESTONES) {
    if (before < milestone.at && after >= milestone.at) return milestone;
  }
  return null;
}
