/** One assigned worker's caller-resolved contribution; stat names and modifiers stay caller-owned. */
export interface StationWorker {
  readonly id: string;
  readonly stat: number;
}

/** Serializable staffing snapshot. The caller owns assignment, unique worker ids, and stable order. */
export interface StaffedStation {
  readonly stationId: string;
  /** Nonnegative whole slot count; fractional values round down and nonfinite values admit no workers. */
  readonly slots: number;
  /** Only the first `slots` entries contribute; overflow assignments are not reordered or mutated. */
  readonly workers: readonly StationWorker[];
}

/** Caller-owned output tuning in production cycles per game-second. */
export interface StationRateTuning {
  readonly base: number;
  readonly perStat: number;
  /** Applied to the whole rate, including base; defaults to 1 and clamps to 0…1. */
  readonly efficiency?: number;
}

function contribution(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Resolve `(base + perStat * sum(admitted worker stats)) * efficiency` without allocation.
 * Empty staffing retains base production. Negative/nonfinite contributions are zero; a nonfinite
 * efficiency or overflowing result stops production with rate zero. Invalid workers still occupy
 * their ordered slots. Assign the result to a `ProductionBuildingDef.rate` for `tickProduction`.
 *
 * @capability staffed-station-rate turn bounded caller-owned worker stats and efficiency into a production rate
 */
export function stationOutputRate(station: StaffedStation, tuning: StationRateTuning): number {
  const efficiency = Math.min(1, contribution(tuning.efficiency ?? 1));
  if (efficiency === 0) return 0;
  const base = contribution(tuning.base);
  const perStat = contribution(tuning.perStat);
  if (perStat === 0) return base * efficiency;
  const slots = Number.isFinite(station.slots) ? Math.max(0, Math.floor(station.slots)) : 0;
  const count = Math.min(slots, station.workers.length);
  let total = 0;
  for (let index = 0; index < count; index += 1) total += contribution(station.workers[index]!.stat);
  const rate = (base + perStat * total) * efficiency;
  return Number.isFinite(rate) ? rate : 0;
}
