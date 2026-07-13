/** Whether a metric must reach up to a target or stay down under it. */
export type ThresholdDirection = "atLeast" | "atMost";

/** A live-metric goal: hit `target` from the required `direction` (defaults to `atLeast`). */
export interface ThresholdObjective {
  id: string;
  target: number;
  direction?: ThresholdDirection;
}

/** Evaluated state of one {@link ThresholdObjective} against a current metric value. */
export interface ObjectiveStatus {
  id: string;
  value: number;
  target: number;
  direction: ThresholdDirection;
  /** True when the value satisfies the target from the required direction. */
  met: boolean;
  /** Fraction toward the target, 0..1 (1 once met). */
  progress: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Evaluate a single live-metric objective: is `value` at least (or at most) the target, and how far along.
 * Unlike an event counter, this reads a continuously-changing metric — population, approval, pollution —
 * the objective shape city-builders and management sims track every tick.
 *
 * @capability objectives check progress of a threshold objective against a live metric
 */
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

/** Rolled-up state across a set of objectives. */
export interface ObjectiveSummary {
  statuses: ObjectiveStatus[];
  /** How many objectives are met. */
  met: number;
  total: number;
  /** True when every objective is met. */
  complete: boolean;
  /** Mean progress across all objectives, 0..1. */
  progress: number;
}

/**
 * Evaluate every objective against current metric values (a lookup map or function) and roll them up into
 * a met-count, completion flag, and mean progress — the brief/charter panel every sim renders.
 */
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
