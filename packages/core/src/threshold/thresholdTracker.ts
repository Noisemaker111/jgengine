// @skill jgengine-gameplay
/**
 * Generic numeric threshold-crossing tracker (#931).
 *
 * A reusable state helper that watches a single numeric source (boss HP percent,
 * a resource pool, an armor gauge, an objective counter) and emits ordered
 * crossing events as named thresholds are passed. Supports crossing direction,
 * a hysteresis band to prevent chatter, a once/repeat policy, and skipped
 * threshold handling (a single large jump emits every threshold it passed, in
 * order). Deterministic and fully serializable so save/load round-trips cleanly.
 *
 * This is intentionally NOT boss-specific: health-gating, phase transitions,
 * armor breaks, music stingers, and resource warnings are all the same
 * primitive. Consumers wire emitted crossings to whatever effect they own —
 * e.g. installing an immunity interceptor from `combat/damage/damageInterceptors`.
 */

import type { ThresholdBoundary } from "./thresholds";

export type CrossingDirection = "falling" | "rising";

export type CrossingTrigger = "falling" | "rising" | "both";

export type CrossingPolicy = "once" | "repeat";

export interface ThresholdCrossingConfig {
  thresholds: readonly ThresholdBoundary[];
  /** Directions that emit crossings; defaults to `"both"`. */
  trigger?: CrossingTrigger;
  /** Symmetric dead-band around each mark that a value must fully clear to flip sides; defaults to `0`. */
  hysteresis?: number;
  policy?: CrossingPolicy;
  initial?: number;
}

export interface ThresholdTrackerCrossing {
  id: string;
  at: number;
  direction: CrossingDirection;
  from: number;
  to: number;
}

export interface ThresholdTrackerSnapshot {
  /** Last observed value, or `null` before the first observation. */
  last: number | null;
  sides: Record<string, "above" | "below">;
  fired: string[];
}

export interface ThresholdTracker {
  update(value: number): ThresholdTrackerCrossing[];
  /** The last observed value, or `null` before the first `update`/seed. */
  value(): number | null;
  reset(initial?: number): void;
  snapshot(): ThresholdTrackerSnapshot;
  restore(snap: ThresholdTrackerSnapshot): void;
}

/**
 * Track a numeric source against named thresholds and emit ordered crossing
 * events with direction, hysteresis, once/repeat policy, and skipped-threshold
 * handling. Deterministic and serializable; drives phase transitions, armor
 * breaks, resource warnings, and any other threshold consumer.
 *
 * @capability threshold-crossings emit ordered crossing events as a numeric source passes named thresholds with hysteresis and once/repeat policy
 */
export function createThresholdTracker(config: ThresholdCrossingConfig): ThresholdTracker {
  const trigger = config.trigger ?? "both";
  const hysteresis = Math.max(0, config.hysteresis ?? 0);
  const policy = config.policy ?? "repeat";
  const marks = [...config.thresholds].sort((a, b) => a.at - b.at);

  const sides = new Map<string, "above" | "below">();
  const fired = new Set<string>();
  let last: number | null = null;

  function sideOf(value: number, at: number): "above" | "below" {
    return value >= at ? "above" : "below";
  }

  function seed(value: number): void {
    sides.clear();
    for (const mark of marks) sides.set(mark.id, sideOf(value, mark.at));
  }

  function allows(direction: CrossingDirection): boolean {
    return trigger === "both" || trigger === direction;
  }

  if (config.initial !== undefined) {
    seed(config.initial);
    last = config.initial;
  }

  return {
    update(value) {
      if (last === null) {
        seed(value);
        last = value;
        return [];
      }
      const from = last;
      const crossings: ThresholdTrackerCrossing[] = [];
      for (const mark of marks) {
        const side = sides.get(mark.id);
        if (side === undefined) {
          sides.set(mark.id, sideOf(value, mark.at));
          continue;
        }
        let next: "above" | "below" | null = null;
        let direction: CrossingDirection | null = null;
        if (side === "above" && value < mark.at - hysteresis) {
          next = "below";
          direction = "falling";
        } else if (side === "below" && value > mark.at + hysteresis) {
          next = "above";
          direction = "rising";
        }
        if (next === null || direction === null) continue;
        sides.set(mark.id, next);
        if (!allows(direction)) continue;
        const key = `${mark.id}:${direction}`;
        if (policy === "once" && fired.has(key)) continue;
        fired.add(key);
        crossings.push({ id: mark.id, at: mark.at, direction, from, to: value });
      }
      last = value;
      // Emit in travel order: falling crosses higher marks first, rising crosses lower marks first.
      const falling = value < from;
      crossings.sort((a, b) => (falling ? b.at - a.at : a.at - b.at));
      return crossings;
    },
    value() {
      return last;
    },
    reset(initial) {
      fired.clear();
      if (initial === undefined) {
        sides.clear();
        last = null;
      } else {
        seed(initial);
        last = initial;
      }
    },
    snapshot() {
      return { last, sides: Object.fromEntries(sides), fired: [...fired] };
    },
    restore(snap) {
      last = snap.last;
      sides.clear();
      for (const [id, side] of Object.entries(snap.sides)) sides.set(id, side);
      fired.clear();
      for (const key of snap.fired) fired.add(key);
    },
  };
}
