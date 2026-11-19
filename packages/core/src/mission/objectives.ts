import { clamp01 } from "../math/scalar";

/** Whether a metric must reach up to a target or stay down under it. */
export type ObjectiveDirection = "atLeast" | "atMost";

/** A live-metric goal: hit `target` from the required `direction` (defaults to `atLeast`). */
export interface ThresholdObjective {
  id: string;
  target: number;
  direction?: ObjectiveDirection;
}

export interface ObjectiveStatus {
  id: string;
  value: number;
  target: number;
  direction: ObjectiveDirection;
  met: boolean;
  /** Fraction toward the target, 0..1 (1 once met). */
  progress: number;
}

/** @capability objectives check progress of a threshold objective against a live metric */
export function evaluateObjective(objective: ThresholdObjective, value: number): ObjectiveStatus {
  const direction = objective.direction ?? "atLeast";
  const target = objective.target;
  let met: boolean;
  let progress: number;
  if (direction === "atMost") {
    met = value <= target;
    progress = met ? 1 : target <= 0 ? 0 : clamp01(target / value);
  } else {
    met = value >= target;
    progress = met ? 1 : target <= 0 ? 1 : clamp01(value / target);
  }
  return { id: objective.id, value, target, direction, met, progress };
}

export interface ObjectiveSummary {
  statuses: ObjectiveStatus[];
  met: number;
  total: number;
  complete: boolean;
  /** Mean progress across all objectives, 0..1. */
  progress: number;
}

export function evaluateObjectives(
  objectives: readonly ThresholdObjective[],
  values: Readonly<Record<string, number>> | ((id: string) => number),
): ObjectiveSummary {
  const lookup = typeof values === "function" ? values : (id: string) => values[id] ?? 0;
  const statuses = objectives.map((objective) => evaluateObjective(objective, lookup(objective.id)));
  const met = statuses.filter((status) => status.met).length;
  const progress = statuses.length === 0 ? 1 : statuses.reduce((sum, s) => sum + s.progress, 0) / statuses.length;
  return { statuses, met, total: statuses.length, complete: met === statuses.length, progress };
}
