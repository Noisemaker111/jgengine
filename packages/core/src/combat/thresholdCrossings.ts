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
 * e.g. installing an immunity interceptor from `combat/damageInterceptors`.
 */

/** A named threshold on the numeric source. */
export interface ThresholdMark {
  /** Stable identifier emitted on crossing and used in the fired-once ledger. */
  id: string;
  /** The value at which this threshold sits. */
  at: number;
}

/** The direction a crossing moved: `falling` = value decreased past the mark, `rising` = increased past it. */
export type CrossingDirection = "falling" | "rising";

/** Which directions should emit crossings. */
export type CrossingTrigger = "falling" | "rising" | "both";

/** Whether a threshold may fire repeatedly (`repeat`) or at most once per direction (`once`). */
export type CrossingPolicy = "once" | "repeat";

/** Caller configuration for a threshold tracker. */
export interface ThresholdCrossingConfig {
  /** Thresholds to watch; order is irrelevant, the tracker sorts by `at`. */
  thresholds: readonly ThresholdMark[];
  /** Directions that emit crossings; defaults to `"both"`. */
  trigger?: CrossingTrigger;
  /** Symmetric dead-band around each mark that a value must fully clear to flip sides; defaults to `0`. */
  hysteresis?: number;
  /** `repeat` (default) re-fires on every crossing; `once` fires each threshold at most once per direction. */
  policy?: CrossingPolicy;
  /** Seed value. When provided, initial sides are computed from it and no crossing is emitted for the seed. */
  initial?: number;
}

/** One emitted crossing: which threshold, which way, and the value span that produced it. */
export interface ThresholdCrossing {
  /** The crossed threshold's id. */
  id: string;
  /** The crossed threshold's value. */
  at: number;
  /** Direction of the crossing. */
  direction: CrossingDirection;
  /** Value before this update. */
  from: number;
  /** Value after this update. */
  to: number;
}

/** Serializable tracker state for save/load. */
export interface ThresholdTrackerSnapshot {
  /** Last observed value, or `null` before the first observation. */
  last: number | null;
  /** Committed side (`"above"`/`"below"`) per threshold id. */
  sides: Record<string, "above" | "below">;
  /** Fired ledger entries (`"<id>:<direction>"`) for the `once` policy. */
  fired: string[];
}

/** A stateful crossing tracker over one numeric source. */
export interface ThresholdTracker {
  /** Observe a new value and return the crossings it produced, in travel order. */
  update(value: number): ThresholdCrossing[];
  /** The last observed value, or `null` before the first `update`/seed. */
  value(): number | null;
  /** Clear the fired ledger; reseed sides from `initial` if given, else await the next `update`. */
  reset(initial?: number): void;
  /** Serializable snapshot. */
  snapshot(): ThresholdTrackerSnapshot;
  /** Restore from a snapshot. */
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
      const crossings: ThresholdCrossing[] = [];
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
