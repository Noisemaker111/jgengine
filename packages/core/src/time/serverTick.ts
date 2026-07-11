export interface TickSystemDefinition<TSystemId extends string = string> {
  id: TSystemId;
  /** Minimum real time between runs; the heartbeat fires the system on the first tick at or past it. */
  intervalMs: number;
}

/** Last-run timestamp per system id. */
export type TickAnchors = Record<string, number>;

export interface ServerTickPlan<TSystemId extends string = string> {
  due: TSystemId[];
  anchors: TickAnchors;
}

export type PlanServerTickOptions = {
  /** Cap catch-up runs per system per heartbeat to avoid spiral-of-death. Default 3. */
  maxCatchUp?: number;
};

const DEFAULT_MAX_CATCH_UP = 3;

/**
 * Decides which systems a heartbeat should run. A system with no anchor runs immediately.
 * When wall time stalls past multiple intervals, the system id is repeated (bounded by
 * maxCatchUp). Excess lag past the bound resyncs the anchor to `now`.
 * Returned anchors carry only systems present in the pipeline, so removed systems clean up.
 */
export function planServerTick<TSystemId extends string>(
  systems: readonly TickSystemDefinition<TSystemId>[],
  anchors: TickAnchors,
  now: number,
  options?: PlanServerTickOptions,
): ServerTickPlan<TSystemId> {
  const maxCatchUp = options?.maxCatchUp ?? DEFAULT_MAX_CATCH_UP;
  const due: TSystemId[] = [];
  const nextAnchors: TickAnchors = {};
  for (const system of systems) {
    const lastRunAt = anchors[system.id];
    if (lastRunAt === undefined) {
      due.push(system.id);
      nextAnchors[system.id] = now;
      continue;
    }
    if (system.intervalMs <= 0) {
      due.push(system.id);
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
      for (let i = 0; i < maxCatchUp; i += 1) due.push(system.id);
      nextAnchors[system.id] = now;
      continue;
    }
    for (let i = 0; i < missed; i += 1) due.push(system.id);
    nextAnchors[system.id] = lastRunAt + missed * system.intervalMs;
  }
  return { due, anchors: nextAnchors };
}
