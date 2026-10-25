import { createSessionLoop, installSessionProbe, type SessionLoop } from "@jgengine/core/run/sessionLoop";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { park } from "./park";

export type DayLoop = SessionLoop<never, void, void>;

/**
 * A park day is a session on the shared loop: it opens with the gates, closes at midnight, and
 * carries nothing - a tycoon day banks its takings in the world as they happen. The loop owns the
 * day count and whether the gates are open; `park.day` republishes the count for the HUD and save.
 */
const days = perContext((ctx: GameContext) => {
  const loop = createSessionLoop<never, void, void>({ kind: "day", carries: false });
  installSessionProbe(loop);
  return { loop, restored: false };
});

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

/** Open today's gates. */
export function openParkDay(ctx: GameContext): void {
  dayLoop(ctx).start();
}

/** Close the day at midnight and republish the day number the loop now counts. */
export function closeParkDay(ctx: GameContext): void {
  const loop = dayLoop(ctx);
  if (loop.phase() === "open") loop.settle();
  park.of(ctx).set("park.day", loop.snapshot().closed + 1);
  loop.start();
}
