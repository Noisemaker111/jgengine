import { createSessionLoop, installSessionProbe, type SessionLoop } from "@jgengine/core/run/sessionLoop";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { householdStore } from "./store";

/** What a shift's boundary hands back: whether it was worked to the end, and the pay it carried. */
export interface ShiftSettlement {
  finished: boolean;
  /** Credits the shift earned and the household ledger already holds. */
  pay: number;
}

export type ShiftLoop = SessionLoop<never, { finished: boolean }, ShiftSettlement>;

interface ShiftSessions {
  loops: Map<string, ShiftLoop>;
  probedId: string | null;
  uninstall: (() => void) | null;
}

const sessions = perContext<ShiftSessions>(() => ({ loops: new Map(), probedId: null, uninstall: null }));

/**
 * One career per member: each paid shift is a session on the shared loop. The loop owns which day's
 * shift is live, whether it has closed, and the pay it carries; the member keeps only career data.
 */
export function shiftLoop(ctx: GameContext, memberId: string): ShiftLoop {
  const slot = sessions(ctx);
  let loop = slot.loops.get(memberId);
  if (loop === undefined) {
    loop = createSessionLoop<never, { finished: boolean }, ShiftSettlement>({
      kind: "shift",
      settle: ({ carried, input }) => ({ finished: input.finished, pay: carried }),
    });
    slot.loops.set(memberId, loop);
  }
  return loop;
}

/**
 * The session number is the day the shift belongs to, so a shift opens once a day and a reload on the
 * same day resumes the same one instead of starting another.
 */
export function openShift(loop: ShiftLoop, day: number): void {
  // One shift a day: a day that already closed stays closed until tomorrow's number arrives.
  if (loop.snapshot().session === day + 1) return;
  loop.restore({ session: day + 1, closed: day, carried: 0, optionId: null });
  loop.start();
}

/** Whether this day's shift has already closed, so the paid work is spent until tomorrow. */
export function shiftRan(ctx: GameContext, memberId: string, day: number): boolean {
  // The household's own record survives a reload: a shift that closed on the day the member saved is
  // spent, even though this page builds the shift's session loop fresh.
  const member = householdStore.read(ctx).members[memberId];
  if (member !== undefined && member.shiftDay >= day) return true;
  const loop = shiftLoop(ctx, memberId);
  return loop.snapshot().session === day + 1 && loop.phase() === "closed";
}

/** Close this day's shift and hand back what it carried; an unopened day opens first. */
export function closeShift(loop: ShiftLoop, day: number, finished: boolean): ShiftSettlement {
  if (loop.phase() !== "open") {
    if (loop.snapshot().session === day + 1) return { finished: true, pay: 0 };
    openShift(loop, day);
  }
  return loop.settle({ finished }).result;
}

/**
 * The probe reports the member whose shift is live and follows the household as the working member
 * changes - one readout of one career's session, never a second copy of its state. Pass `day` from a
 * shift that is only ticking: a shift that already closed that day keeps the readout until another
 * one closes or the day turns, so the next worker's open shift cannot hide the boundary.
 */
export function probeShift(ctx: GameContext, memberId: string, day?: number): void {
  const slot = sessions(ctx);
  if (slot.probedId === memberId) return;
  if (day !== undefined && slot.probedId !== null) {
    const probed = slot.loops.get(slot.probedId);
    if (probed !== undefined && probed.phase() === "closed" && probed.snapshot().session === day + 1) return;
  }
  slot.uninstall?.();
  slot.uninstall = installSessionProbe(shiftLoop(ctx, memberId));
  slot.probedId = memberId;
}