import { useEffect, useState } from "react";

import { computeClientServerOffset, computeGameTime, type GameTime } from "@jgengine/core/time/calendarClock";
import { getCurrentGameTimestamp, sanitizeGameTimeScale } from "@jgengine/core/time/gameClock";

/** Options for {@link useCalendarClock}. */
export interface CalendarClockOptions {
  /** In-world seconds per real second. Default from `sanitizeGameTimeScale`. */
  timeScale?: number | undefined;
  /** How often the clock re-reads time, in real milliseconds. Default 500. */
  tickMs?: number;
  /** Injected client clock (ms). Default `Date.now`. */
  now?: () => number;
}

/**
 * The in-world calendar of a world created at `createdAt`, aligned to the server's clock from one
 * `serverNow` reading and re-read every `tickMs`. Null until both are known.
 *
 * @capability calendar-clock-hook live in-world date and time for a HUD, aligned to the server clock
 */
export function useCalendarClock(
  createdAt: number | undefined,
  serverNow: number | undefined,
  options: CalendarClockOptions = {},
): GameTime | null {
  const now = options.now ?? Date.now;
  const tickMs = options.tickMs ?? 500;
  const [offsetMs, setOffsetMs] = useState(0);
  const [clientNow, setClientNow] = useState(now);

  useEffect(() => {
    if (createdAt === undefined || serverNow === undefined) return;
    setOffsetMs(computeClientServerOffset(serverNow, now()));
    const tick = () => setClientNow(now());
    tick();
    const interval = setInterval(tick, tickMs);
    return () => clearInterval(interval);
  }, [createdAt, serverNow, tickMs, now]);

  if (createdAt === undefined || serverNow === undefined) return null;
  return computeGameTime(getCurrentGameTimestamp(createdAt, clientNow + offsetMs, sanitizeGameTimeScale(options.timeScale)));
}
