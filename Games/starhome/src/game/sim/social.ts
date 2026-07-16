import { tierForStanding, type ReputationTier } from "@jgengine/core/faction/reputation";

const REL_TIERS: readonly ReputationTier[] = [
  { id: "Rivals", min: -100, relation: "hostile" },
  { id: "Tense", min: -40, relation: "hostile" },
  { id: "Neutral", min: -10, relation: "neutral" },
  { id: "Warm", min: 10, relation: "neutral" },
  { id: "Friends", min: 35, relation: "friendly" },
  { id: "Close", min: 70, relation: "friendly" },
  { id: "Bonded", min: 95, relation: "friendly" },
];

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
  return tierForStanding(REL_TIERS, value).id;
}

export function crossedMilestone(before: number, after: number): RelMilestone | null {
  for (const milestone of REL_MILESTONES) {
    if (before < milestone.at && after >= milestone.at) return milestone;
  }
  return null;
}
