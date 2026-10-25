import type { SessionSnapshot } from "../run/session";

/** The buggy idles at spawn with no prompt; the first gate cue names the throttle until the car rolls or this clock runs out. */
export const LAUNCH_CUE_SECONDS = 10;
const ROLLING_KMH = 1;

export function launchCue(snapshot: Pick<SessionSnapshot, "runTime" | "pose">): string | null {
  const idle = snapshot.pose.speedKmh < ROLLING_KMH && !snapshot.pose.airborne;
  return idle && snapshot.runTime < LAUNCH_CUE_SECONDS ? "HOLD W TO ROLL" : null;
}
