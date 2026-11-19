import { createSessionLoop, type SessionLoop, type SessionLoopPersistence, type SessionLoopState } from "@jgengine/core/run/sessionLoop";

import { RUN_SEED } from "./constants";
import { SHIFT_TABLE, type ShiftEffect } from "./shifts";

export const RUN_STATE_KEY = "drift-foundry.run.v1";

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function readRunState(value: unknown): SessionLoopState | null {
  if (value === null || typeof value !== "object") return null;
  const data = value as Partial<SessionLoopState> & { run?: unknown; completed?: unknown; haul?: unknown; changeId?: unknown };
  // Saves written before the session loop named the same four numbers run/completed/haul/changeId.
  const session = data.session ?? data.run;
  const closed = data.closed ?? data.completed;
  const carried = data.carried ?? data.haul;
  const optionId = data.optionId !== undefined ? data.optionId : data.changeId;
  if (!count(session) || !count(closed) || session < closed || !count(carried)) return null;
  if (optionId !== null && typeof optionId !== "string") return null;
  return { session, closed, carried, optionId };
}

export type RunOutcome = "banked" | "lost";

export interface RunBank {
  banked: number;
  lost: number;
}

export type ShiftLoop = SessionLoop<ShiftEffect, { outcome: RunOutcome; multiplier?: number }, RunBank>;

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
