import type { RunLoopState } from "@jgengine/core/run/runLoop";

import type { RecordStorage } from "./records";

/** The career's run history: how many runs are behind it, and which shift the next one drew. */
export const RUN_STATE_KEY = "drift-foundry.run.v1";

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A saved run loop, or `null` when the save is missing, old or not numbers it can trust. */
export function readRunState(storage?: RecordStorage): RunLoopState | null {
  try {
    const data = JSON.parse(storage?.getItem(RUN_STATE_KEY) ?? "null") as Partial<RunLoopState> | null;
    if (data === null || typeof data !== "object") return null;
    if (!count(data.run) || !count(data.completed) || data.run < data.completed) return null;
    if (!count(data.bankedTotal) || !count(data.lostTotal) || !count(data.bestHaul)) return null;
    if (!count(data.haul) || typeof data.run !== "number") return null;
    if (data.changeId !== null && typeof data.changeId !== "string") return null;
    return {
      run: data.run,
      completed: data.completed,
      haul: data.haul,
      changeId: data.changeId,
      bankedTotal: data.bankedTotal,
      lostTotal: data.lostTotal,
      bestHaul: data.bestHaul,
    };
  } catch {
    return null;
  }
}

export function saveRunState(state: RunLoopState, storage?: RecordStorage): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(RUN_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
