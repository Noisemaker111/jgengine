import { createSessionLoop, type SessionLoop, type SessionLoopPersistence, type SessionLoopState } from "@jgengine/core/run/sessionLoop";

import { RUN_SEED } from "./constants";
import { SHIFT_TABLE, type ShiftEffect } from "./shifts";

import type { RunStorage } from "./records";

/** The career's run history: how many runs are behind it, and which shift the next one drew. */
export const RUN_STATE_KEY = "drift-foundry.run.v1";

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** A saved run loop, or `null` when the save is missing, old or not numbers it can trust. */
export function readRunState(storage?: RunStorage): SessionLoopState | null {
  try {
    const data = JSON.parse(storage?.getItem(RUN_STATE_KEY) ?? "null") as
      | (Partial<SessionLoopState> & { run?: unknown; completed?: unknown; haul?: unknown; changeId?: unknown })
      | null;
    if (data === null || typeof data !== "object") return null;
    // Saves written before the session loop named the same four numbers run/completed/haul/changeId.
    const session = data.session ?? data.run;
    const closed = data.closed ?? data.completed;
    const carried = data.carried ?? data.haul;
    const optionId = data.optionId !== undefined ? data.optionId : data.changeId;
    if (!count(session) || !count(closed) || session < closed || !count(carried)) return null;
    if (optionId !== null && typeof optionId !== "string") return null;
    return { session, closed, carried, optionId };
  } catch {
    return null;
  }
}

export function saveRunState(state: SessionLoopState, storage?: RunStorage): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(RUN_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** How a run ended: what it carried reached the bank, or it was lost. */
export type RunOutcome = "banked" | "lost";

/** What one closed run banked or lost. */
export interface RunBank {
  banked: number;
  lost: number;
}

export type ShiftLoop = SessionLoop<ShiftEffect, { outcome: RunOutcome; multiplier?: number }, RunBank>;

/**
 * The yard's run loop: the engine session loop carries the salvage at risk and draws the shift the
 * next run opens with; this rule decides that an escape banks the haul scaled by the line and a wreck
 * loses all of it.
 */
export function createShiftLoop(persist?: SessionLoopPersistence): ShiftLoop {
  return createSessionLoop<ShiftEffect, { outcome: RunOutcome; multiplier?: number }, RunBank>({
    kind: "run",
    seed: RUN_SEED,
    offers: SHIFT_TABLE,
    ...(persist === undefined ? {} : { persist }),
    settle: ({ carried, input }) => {
      if (input.outcome === "lost") return { banked: 0, lost: carried };
      const scale = Number.isFinite(input.multiplier) ? Math.max(0, input.multiplier ?? 1) : 1;
      return { banked: Math.round(carried * scale), lost: 0 };
    },
  });
}
