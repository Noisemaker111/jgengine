export interface LaneCandidate<TId extends string = string> {
  id: TId;
  cost: number;
}

export interface PickLaneOptions<TId extends string = string> {
  /** The lane currently taken — kept unless a rival is decisively cheaper. */
  current?: TId | null;
  /** How much cheaper a rival must be to displace `current`: it wins only when `cost < currentCost / stickiness`. Default `1.2`. */
  stickiness?: number;
  /** Candidates within this cost of the best tie for the win; the tie is broken by `rng`. Default `0`. */
  tieEpsilon?: number;
  rng?: () => number;
}

/**
 * Live cost-based selection over parallel corridors (#286.7) — the racing-line / lane-merge pick
 * every AI driver hand-rolled. Evaluate each lane's cost this tick (crowding, hazards, distance)
 * and let stickiness hysteresis stop the agent flip-flopping between near-equal lanes.
  * @internal
  */
export function pickLane<TId extends string>(
  candidates: readonly LaneCandidate<TId>[],
  options: PickLaneOptions<TId> = {},
): TId | null {
  if (candidates.length === 0) return null;
  const stickiness = options.stickiness ?? 1.2;
  const tieEpsilon = options.tieEpsilon ?? 0;
  const rng = options.rng ?? Math.random;

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.cost < best.cost) best = candidate;
  }

  if (tieEpsilon > 0) {
    const tied = candidates.filter((candidate) => candidate.cost <= best.cost + tieEpsilon);
    if (tied.length > 1) best = tied[Math.min(tied.length - 1, Math.floor(rng() * tied.length))]!;
  }

  const current = options.current ?? null;
  if (current !== null && current !== best.id) {
    const currentCandidate = candidates.find((candidate) => candidate.id === current);
    if (currentCandidate !== undefined && best.cost >= currentCandidate.cost / stickiness) {
      return current;
    }
  }
  return best.id;
}

/** Sum a live cost function over a corridor's sample points — the standard way to build `LaneCandidate.cost`.
 * @internal
 */
export function corridorCost(
  points: readonly (readonly [number, number])[],
  costAt: (x: number, z: number) => number,
): number {
  let total = 0;
  for (const [x, z] of points) total += costAt(x, z);
  return total;
}
