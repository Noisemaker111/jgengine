import { ENDLESS_WAVES } from "./endless";
import { TOTAL_WAVES } from "./manifest";

/**
 * What kind of shift the run is: an ordinary day (twelve waves, on the season's districts) or
 * Overtime (endless, through the eras). The career's campaign stores the choice; a run reads it
 * here when it opens or loads, so the director, the HUD and the end-of-day board agree.
 */
export type RunMode = "day" | "overtime";
export const RUN_MODES: readonly RunMode[] = ["day", "overtime"];

let mode: RunMode = "day";

export function runMode(): RunMode {
  return mode;
}

/** Called as a run opens or loads, from the career's choice. @internal */
export function bindRunMode(next: RunMode): void {
  mode = next;
}

export function isOvertime(): boolean {
  return mode === "overtime";
}

/** How many waves this run has: twelve for a day, Overtime's whole night otherwise. */
export function waveTotal(): number {
  return mode === "overtime" ? ENDLESS_WAVES : TOTAL_WAVES;
}
