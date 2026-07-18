import type { NumericBounds } from "@jgengine/core/relation/keyedValues";
import { crossThresholds, type ThresholdBoundary } from "@jgengine/core/relation/thresholds";

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

/** Caller-owned bounds for the -100..100 relationship scale. */
export const REL_BOUNDS: NumericBounds = { min: -100, max: 100 };

/** Milestones expressed as generic threshold boundaries the core crossing helper consumes. */
export const REL_MILESTONE_BOUNDARIES: readonly ThresholdBoundary<RelMilestone>[] = REL_MILESTONES.map(
  (milestone) => ({ id: milestone, at: milestone.at }),
);

export function relationLabel(value: number): string {
  if (value >= 95) return "Bonded";
  if (value >= 70) return "Close";
  if (value >= 35) return "Friends";
  if (value >= 10) return "Warm";
  if (value > -10) return "Neutral";
  if (value > -40) return "Tense";
  return "Rivals";
}

/** Every milestone newly crossed upward moving `before` -> `after`, lowest first. */
export function crossedMilestones(before: number, after: number): RelMilestone[] {
  return crossThresholds(REL_MILESTONE_BOUNDARIES, before, after)
    .filter((crossing) => crossing.direction === "up")
    .map((crossing) => crossing.id);
}

/** The lowest milestone newly crossed upward, or null. */
export function crossedMilestone(before: number, after: number): RelMilestone | null {
  return crossedMilestones(before, after)[0] ?? null;
}
