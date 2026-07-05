/**
 * Single-finger gesture disambiguation for touch look controls: one touch
 * stream drives look-drag, tap, and long-press-hold without fighting.
 * Movement past the tap threshold commits the gesture to "look" and cancels
 * tap/hold; a still finger that lifts quickly is a tap; a still finger held
 * past the long-press delay is a hold. Timestamps are injected so the state
 * machine stays pure; the capture layer owns timers and touch identifiers.
 */

export interface TouchGestureTuning {
  /** A finger that moves less than this (px) and lifts quickly is a tap. */
  tapMoveThresholdPx: number;
  tapMaxMs: number;
  /** Hold this long without moving to begin a hold gesture. */
  longPressMs: number;
}

export type TouchGestureEnd = "tap" | "hold-end" | null;

export interface TouchGestureTracker {
  begin(x: number, y: number, nowMs: number): void;
  /** Look-drag delta since the last move, or null when no gesture is active. */
  move(x: number, y: number): { dx: number; dy: number } | null;
  /** Commit to a hold if the finger is still down and hasn't moved. */
  beginHold(): boolean;
  end(nowMs: number): TouchGestureEnd;
  cancel(): TouchGestureEnd;
  isActive(): boolean;
  isHolding(): boolean;
}

export function createTouchGestureTracker(tuning: TouchGestureTuning): TouchGestureTracker {
  let active = false;
  let moved = false;
  let holding = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;

  return {
    begin(x, y, nowMs) {
      active = true;
      moved = false;
      holding = false;
      startX = lastX = x;
      startY = lastY = y;
      startTime = nowMs;
    },
    move(x, y) {
      if (!active) return null;
      if (!moved && Math.hypot(x - startX, y - startY) > tuning.tapMoveThresholdPx) {
        moved = true;
      }
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      return { dx, dy };
    },
    beginHold() {
      if (!active || moved || holding) return false;
      holding = true;
      return true;
    },
    end(nowMs) {
      if (!active) return null;
      active = false;
      if (holding) {
        holding = false;
        return "hold-end";
      }
      if (!moved && nowMs - startTime <= tuning.tapMaxMs) return "tap";
      return null;
    },
    cancel() {
      active = false;
      if (holding) {
        holding = false;
        return "hold-end";
      }
      return null;
    },
    isActive() {
      return active;
    },
    isHolding() {
      return holding;
    },
  };
}
