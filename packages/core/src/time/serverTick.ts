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

/**
 * Decides which systems a heartbeat should run. A system with no anchor runs immediately.
 * Returned anchors carry only systems present in the pipeline, so removed systems clean up.
 */
export function planServerTick<TSystemId extends string>(
  systems: readonly TickSystemDefinition<TSystemId>[],
  anchors: TickAnchors,
  now: number,
): ServerTickPlan<TSystemId> {
  const due: TSystemId[] = [];
  const nextAnchors: TickAnchors = {};
  for (const system of systems) {
    const lastRunAt = anchors[system.id];
    if (lastRunAt !== undefined && now - lastRunAt < system.intervalMs) {
      nextAnchors[system.id] = lastRunAt;
      continue;
    }
    due.push(system.id);
    nextAnchors[system.id] = now;
  }
  return { due, anchors: nextAnchors };
}
