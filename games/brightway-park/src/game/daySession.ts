import { createSessionLoop, installSessionProbe, type SessionLoop } from "@jgengine/core/run/sessionLoop";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { park } from "./park";

export type DayLoop = SessionLoop<never, void, void>;

function newLoop(): DayLoop {
  const loop = createSessionLoop<never, void, void>({ kind: "day", carries: false });
  installSessionProbe(loop);
  return loop;
}
const days = perContext((_ctx: GameContext) => ({ loop: newLoop(), restored: false }));

export function resetDayLoop(ctx: GameContext): void {
  const slot = days(ctx);
  slot.loop = newLoop();
  slot.restored = false;
}

export function dayLoop(ctx: GameContext): DayLoop {
  const slot = days(ctx);
  if (!slot.restored) {
    slot.restored = true;
    // The save's day is the last one that closed; a loaded park resumes that day open.
    const day = park.of(ctx).num("park.day");
    if (day > 1) {
      slot.loop.restore({ session: day, closed: day - 1, carried: 0, optionId: null });
      slot.loop.start();
    }
  }
  return slot.loop;
}

export function openParkDay(ctx: GameContext): void {
  dayLoop(ctx).start();
}

export function closeParkDay(ctx: GameContext): void {
  const loop = dayLoop(ctx);
  // A day the park ran without its gates being opened through `park.start` (a replayed scenario) still counts.
  if (loop.phase() !== "open") loop.start();
  loop.settle();
  park.of(ctx).set("park.day", loop.snapshot().closed + 1);
  loop.start();
}
