export interface StationWorker {
  readonly id: string;
  readonly stat: number;
}

/** Serializable staffing snapshot. The caller owns assignment, unique worker ids, and stable order. */
export interface StaffedStation {
  readonly stationId: string;
  readonly slots: number;
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

/** @capability staffed-station-rate turn bounded caller-owned worker stats and efficiency into a production rate */
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
