export interface TickSystemDefinition<TSystemId extends string = string> {
  id: TSystemId;
  /** Minimum real time between runs; the heartbeat fires the system on the first tick at or past it. */
  intervalMs: number;
  scope?: "onlinePlayers" | "allServers";
  batchSize?: number;
}

/** Last-run timestamp per system id. */
export type TickAnchors = Record<string, number>;

/** One due system and how many times this heartbeat owes it. */
export interface TickSystemRun<TSystemId extends string = string> {
  id: TSystemId;
  /** Times to run the system now; above 1 when wall time stalled past several intervals. */
  runs: number;
  scope?: "onlinePlayers" | "allServers";
  batchSize?: number;
}

export interface ServerTickPlan<TSystemId extends string = string> {
  /**
   * Due systems, at most one entry per id. `runs` carries catch-up multiplicity — the anchors were
   * advanced by that many intervals, so a host that runs the handler once per entry silently drops
   * the rest.
   */
  due: TickSystemRun<TSystemId>[];
  anchors: TickAnchors;
}

export type PlanServerTickOptions = {
  /** Cap catch-up runs per system per heartbeat to avoid spiral-of-death. Default 3. */
  maxCatchUp?: number;
};

const DEFAULT_MAX_CATCH_UP = 3;

/**
 * Decides which systems a heartbeat should run. A system with no anchor runs immediately.
 * When wall time stalls past multiple intervals the system's `runs` climbs (bounded by
 * maxCatchUp), and the returned anchor moves by that many intervals — so a host that ignores
 * `runs` loses the catch-up work. Excess lag past the bound resyncs the anchor to `now`.
 * Returned anchors carry only systems present in the pipeline, so removed systems clean up.
 */
export function planServerTick<TSystemId extends string>(
  systems: readonly TickSystemDefinition<TSystemId>[],
  anchors: TickAnchors,
  now: number,
  options?: PlanServerTickOptions,
): ServerTickPlan<TSystemId> {
  const maxCatchUp = options?.maxCatchUp ?? DEFAULT_MAX_CATCH_UP;
  const due: TickSystemRun<TSystemId>[] = [];
  const nextAnchors: TickAnchors = {};
  for (const system of systems) {
    if (system.batchSize !== undefined && (!Number.isSafeInteger(system.batchSize) || system.batchSize < 1 || system.batchSize > 1000)) throw new RangeError("batchSize must be an integer from 1 to 1000");
    const dispatch = { ...(system.scope === undefined ? {} : { scope: system.scope }), ...(system.batchSize === undefined ? {} : { batchSize: system.batchSize }) };
    const lastRunAt = anchors[system.id];
    if (lastRunAt === undefined || system.intervalMs <= 0) {
      due.push({ id: system.id, runs: 1, ...dispatch });
      nextAnchors[system.id] = now;
      continue;
    }
    const elapsed = now - lastRunAt;
    if (elapsed < system.intervalMs) {
      nextAnchors[system.id] = lastRunAt;
      continue;
    }
    const missed = Math.floor(elapsed / system.intervalMs);
    if (missed > maxCatchUp) {
      due.push({ id: system.id, runs: maxCatchUp, ...dispatch });
      nextAnchors[system.id] = now;
      continue;
    }
    due.push({ id: system.id, runs: missed, ...dispatch });
    nextAnchors[system.id] = lastRunAt + missed * system.intervalMs;
  }
  return { due, anchors: nextAnchors };
}

/** Times this plan owes `id`, or 0 when it is not due. Saves a host a lookup over {@link ServerTickPlan.due}. */
export function tickRunCount<TSystemId extends string>(
  plan: ServerTickPlan<TSystemId>,
  id: TSystemId,
): number {
  return plan.due.find((entry) => entry.id === id)?.runs ?? 0;
}
