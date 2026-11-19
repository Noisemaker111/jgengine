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

export interface ThresholdBoundary<Id = string> {
  readonly id: Id;
  readonly at: number;
}

export interface ThresholdCrossing<Id = string> {
  readonly id: Id;
  readonly at: number;
  readonly direction: ThresholdDirection;
}

export interface CrossThresholdsOptions {
  readonly inclusive?: boolean;
  /**
   * Symmetric dead-band (clamped to `>= 0`). An upward crossing of `at` requires
   * reaching `at + hysteresis`; a downward crossing requires falling below
   * `at - hysteresis`. Suppresses flapping when a value oscillates around a
   * boundary. Defaults to `0` (no dead-band).
   */
  readonly hysteresis?: number;
}

/** @capability detect fire-once threshold/milestone/tier crossings when a value moves */
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

/** @capability resolve the current tier/band label for a keyed or scalar value */
export function tierAt<Id>(
  boundaries: readonly ThresholdBoundary<Id>[],
  value: number,
  options: { readonly inclusive?: boolean; readonly descending?: boolean } = {},
): ThresholdBoundary<Id> | null {
  const inclusive = options.inclusive ?? true;
  const descending = options.descending === true;
  let match: ThresholdBoundary<Id> | null = null;
  for (const boundary of boundaries) {
    const occupied = descending
      ? inclusive ? value <= boundary.at : value < boundary.at
      : inclusive ? value >= boundary.at : value > boundary.at;
    if (occupied && (match === null || (descending ? boundary.at < match.at : boundary.at > match.at))) match = boundary;
  }
  return match;
}
