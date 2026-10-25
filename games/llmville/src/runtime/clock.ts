import {
  computeClientServerOffset,
  computeGameTime,
  getGameClockTimestamp,
  type GameTime,
} from "@jgengine/core/time/calendarClock";
import { useEffect, useState } from "react";

export {
  computeClientServerOffset,
  getGameClockTimestamp,
  type GameTime,
} from "@jgengine/core/time/calendarClock";

/*
 * Clock authority (p24 Bucket B item 2):
 *
 * - Authoritative game calendar time: Convex `serverNow` on the game row, aligned to the
 *   client via `computeClientServerOffset`, then scaled with `createdAt` + `gameTimeScale`
 *   through `getGameClockTimestamp` / `useGameClock`. Use this for HUD dates, training
 *   countdowns, and any gameplay deadline keyed to in-world time.
 *
 * - Ephemeral client sim state (transient celebration / spend / unlock cues and timed
 *   tutorial steps) is driven by precise one-shot timers in `useEngineEphemeralTimers`
 *   (worldState.ts) — each schedules a single setTimeout for exactly when it is due rather
 *   than polling, so an idle world does no work. It does not advance authoritative game
 *   calendar time and does not call Convex.
 *
 * - Convex cron ticks (training, serving income, billing): separate server-side schedulers;
 *   they mutate persisted state on the backend and are unrelated to the client display clock
 *   or the rAF loop.
 */

const CLOCK_TICK_MS = 500;

export function useGameClock(
  createdAt: number | undefined,
  serverNow: number | undefined,
  gameTimeScale?: number,
): GameTime | null {
  const [clientOffsetMs, setClientOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (createdAt === undefined || serverNow === undefined) {
      return;
    }
    setClientOffsetMs(computeClientServerOffset(serverNow, Date.now()));
  }, [createdAt, serverNow]);

  useEffect(() => {
    if (createdAt === undefined || serverNow === undefined) {
      return;
    }
    const tick = () => setNowMs(Date.now());
    tick();
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, [createdAt, serverNow]);

  if (createdAt === undefined || serverNow === undefined) {
    return null;
  }

  const gameTimestamp = getGameClockTimestamp(
    createdAt,
    nowMs + clientOffsetMs,
    nowMs,
    gameTimeScale,
  );
  return computeGameTime(gameTimestamp);
}
