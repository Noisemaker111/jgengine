import type { SessionSnapshot } from "../run/session";

/** The cart idles at spawn with no prompt; the first sign names the throttle until the cart rolls or this clock runs out. */
export const LAUNCH_CUE_SECONDS = 10;
const ROLLING_KMH = 1;

export function launchCue(snapshot: Pick<SessionSnapshot, "runTime" | "pose">): string | null {
  const idle = snapshot.pose.speedKmh < ROLLING_KMH && !snapshot.pose.airborne;
  return idle && snapshot.runTime < LAUNCH_CUE_SECONDS ? "HOLD W TO PUSH" : null;
}
