import type { HapticLevel } from "@jgengine/core/input/haptics";

/** How long each rumble command lasts; refreshed before it runs out so a held level feels continuous. */
export const PAD_HAPTIC_EFFECT_MS = 120;
const REFRESH_MS = 80;
const CHANGE = 0.03;
const SILENT = 0.01;

/** Last command sent to one pad. */
export interface PadHapticState {
  strong: number;
  weak: number;
  sentAtMs: number;
  active: boolean;
}

/** Fresh state for {@link stepPadHaptics}. */
export function emptyPadHapticState(): PadHapticState {
  return { strong: 0, weak: 0, sentAtMs: -Infinity, active: false };
}

/**
 * Decide what to send a pad this frame for a mixed level: `"play"` when the level changed or the
 * last effect is about to run out, `"reset"` when it fell silent, `null` otherwise.
 */
export function stepPadHaptics(state: PadHapticState, level: HapticLevel, nowMs: number): "play" | "reset" | null {
  const silent = level.strong < SILENT && level.weak < SILENT;
  if (silent) {
    if (!state.active) return null;
    state.active = false;
    state.strong = 0;
    state.weak = 0;
    return "reset";
  }
  const changed = Math.abs(level.strong - state.strong) > CHANGE || Math.abs(level.weak - state.weak) > CHANGE;
  if (state.active && !changed && nowMs - state.sentAtMs < REFRESH_MS) return null;
  state.active = true;
  state.strong = level.strong;
  state.weak = level.weak;
  state.sentAtMs = nowMs;
  return "play";
}
