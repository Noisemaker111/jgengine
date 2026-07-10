export interface CaptureState {
  readonly withinRangeSince: number | null;
}

export const INITIAL_CAPTURE_STATE: CaptureState = { withinRangeSince: null };

export const CAPTURE_RADIUS_METERS = 15;
export const CAPTURE_HOLD_SECONDS = 3;

export interface CaptureAdvance {
  readonly state: CaptureState;
  readonly captured: boolean;
  readonly tensionFraction: number;
}

export function advanceCapture(state: CaptureState, distance: number, now: number): CaptureAdvance {
  if (distance > CAPTURE_RADIUS_METERS) {
    return { state: INITIAL_CAPTURE_STATE, captured: false, tensionFraction: 0 };
  }
  const since = state.withinRangeSince ?? now;
  const elapsed = now - since;
  const tensionFraction = Math.min(1, Math.max(0, elapsed / CAPTURE_HOLD_SECONDS));
  return { state: { withinRangeSince: since }, captured: elapsed >= CAPTURE_HOLD_SECONDS, tensionFraction };
}
