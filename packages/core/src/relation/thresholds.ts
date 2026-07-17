/**
 * Generic threshold-crossing detection over ordered numeric boundaries.
 *
 * Deliberately relationship-agnostic and stateless: the same helper reports
 * reputation-tier transitions, meter milestones, temperature bands, ecosystem
 * pressure, difficulty ramps, or any value moving across labelled cut points.
 * Callers pass `before`/`after` and receive the crossings between them, so the
 * logic never lives inside a ledger or owns hidden state.
 */

export type ThresholdDirection = "up" | "down";

/** A labelled cut point on the value axis. `Id` is caller-owned (string, enum, or a policy object). */
export interface ThresholdBoundary<Id = string> {
  /** Stable identifier reported when this boundary is crossed. */
  readonly id: Id;
  /** Numeric position of the boundary on the value axis. */
  readonly at: number;
}

/** A single boundary transition between a `before` and `after` value. */
export interface ThresholdCrossing<Id = string> {
  readonly id: Id;
  readonly at: number;
  readonly direction: ThresholdDirection;
}

/** Exact-boundary and dead-band policy for {@link crossThresholds}. */
export interface CrossThresholdsOptions {
  /**
   * When true (default) a boundary is *occupied* at `value >= at`; when false it
   * is occupied only at `value > at`. Controls exact-boundary semantics: with the
   * default, landing exactly on `at` counts as an upward crossing and keeps you
   * above on the way down.
   */
  readonly inclusive?: boolean;
  /**
   * Symmetric dead-band (clamped to `>= 0`). An upward crossing of `at` requires
   * reaching `at + hysteresis`; a downward crossing requires falling below
   * `at - hysteresis`. Suppresses flapping when a value oscillates around a
   * boundary. Defaults to `0` (no dead-band).
   */
  readonly hysteresis?: number;
}

/**
 * Report every boundary crossed moving from `before` to `after`.
 *
 * Upward moves yield `up` crossings in ascending `at` order; downward moves yield
 * `down` crossings in descending order. Large jumps report every boundary passed;
 * a zero-width move reports nothing. Boundaries need not be pre-sorted.
 *
 * @capability detect fire-once threshold/milestone/tier crossings when a value moves
 */
export function crossThresholds<Id>(
  boundaries: readonly ThresholdBoundary<Id>[],
  before: number,
  after: number,
  options: CrossThresholdsOptions = {},
): ThresholdCrossing<Id>[] {
  if (after === before) return [];
  const inclusive = options.inclusive ?? true;
  const margin = options.hysteresis !== undefined && options.hysteresis > 0 ? options.hysteresis : 0;
  const rising = after > before;
  const occupied = (value: number, edge: number): boolean => (inclusive ? value >= edge : value > edge);
  const crossings: ThresholdCrossing<Id>[] = [];
  for (const boundary of boundaries) {
    if (rising) {
      const edge = boundary.at + margin;
      if (!occupied(before, edge) && occupied(after, edge)) {
        crossings.push({ id: boundary.id, at: boundary.at, direction: "up" });
      }
    } else {
      const edge = boundary.at - margin;
      if (occupied(before, edge) && !occupied(after, edge)) {
        crossings.push({ id: boundary.id, at: boundary.at, direction: "down" });
      }
    }
  }
  crossings.sort((a, b) => (rising ? a.at - b.at : b.at - a.at));
  return crossings;
}

/**
 * The highest boundary at-or-below `value` — the band the value currently sits in.
 * Returns `null` when `value` is below every boundary. Boundaries need not be sorted.
 *
 * Tier labels stay caller policy: pass an `Id` object carrying whatever label,
 * relation, or colour the game needs.
 *
 * @capability resolve the current tier/band label for a keyed or scalar value
 */
export function tierAt<Id>(
  boundaries: readonly ThresholdBoundary<Id>[],
  value: number,
  options: { readonly inclusive?: boolean } = {},
): ThresholdBoundary<Id> | null {
  const inclusive = options.inclusive ?? true;
  let match: ThresholdBoundary<Id> | null = null;
  for (const boundary of boundaries) {
    const occupied = inclusive ? value >= boundary.at : value > boundary.at;
    if (occupied && (match === null || boundary.at > match.at)) match = boundary;
  }
  return match;
}
