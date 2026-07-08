/**
 * Single-finger play-surface gesture recognizer for touch controls: taps,
 * directional flick swipes, and continuous step drags all resolve to action
 * names from a TouchGestureBindings declaration. Drag steps stream out of
 * move() as the finger travels; taps and swipes resolve on end(). Timestamps
 * are injected so the state machine stays pure; the capture layer owns touch
 * identifiers and pointer capture.
 */

import type { TouchGestureBindings } from "./touchScheme";

export interface GestureSurfaceTuning {
  /** A finger that moves less than this (px) and lifts quickly is a tap. */
  tapMoveThresholdPx: number;
  tapMaxMs: number;
  /** Minimum travel (px) for a lift to register as a swipe. */
  swipeMinPx: number;
  /** Minimum lift velocity (px/ms) for a swipe; slower travel is a drag that ends quietly. */
  swipeMinVelocity: number;
  /** Default travel (px) per repeated drag action when the binding sets none. */
  dragStepPx: number;
}

export const DEFAULT_GESTURE_TUNING: GestureSurfaceTuning = {
  tapMoveThresholdPx: 12,
  tapMaxMs: 280,
  swipeMinPx: 48,
  swipeMinVelocity: 0.45,
  dragStepPx: 36,
};

export interface GestureSurfaceTracker {
  begin(x: number, y: number, nowMs: number): void;
  /** Drag-step actions fired by this movement, in travel order. */
  move(x: number, y: number): readonly string[];
  /** Tap or swipe action resolved by lifting the finger, if any. */
  end(x: number, y: number, nowMs: number): readonly string[];
  cancel(): void;
  isActive(): boolean;
}

type Axis = "horizontal" | "vertical";

export function createGestureSurfaceTracker(
  bindings: TouchGestureBindings,
  tuning: GestureSurfaceTuning = DEFAULT_GESTURE_TUNING,
): GestureSurfaceTracker {
  const drag = bindings.drag;
  const dragStepPx = drag?.stepPx ?? tuning.dragStepPx;
  const dragBound: Record<Axis, boolean> = {
    horizontal: drag?.left !== undefined || drag?.right !== undefined,
    vertical: drag?.up !== undefined || drag?.down !== undefined,
  };

  let active = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;
  let moved = false;
  let axis: Axis | null = null;
  let dragAccum = 0;
  let dragStepsFired = 0;

  const commitAxis = (totalDx: number, totalDy: number): void => {
    if (axis !== null) return;
    axis = Math.abs(totalDx) >= Math.abs(totalDy) ? "horizontal" : "vertical";
  };

  const swipeFor = (totalDx: number, totalDy: number): string | undefined => {
    if (axis === "horizontal") {
      return totalDx >= 0 ? bindings.swipeRight : bindings.swipeLeft;
    }
    return totalDy >= 0 ? bindings.swipeDown : bindings.swipeUp;
  };

  const dragActionFor = (direction: number): string | undefined => {
    if (axis === "horizontal") return direction >= 0 ? drag?.right : drag?.left;
    return direction >= 0 ? drag?.down : drag?.up;
  };

  return {
    begin(x, y, nowMs) {
      active = true;
      startX = lastX = x;
      startY = lastY = y;
      startTime = nowMs;
      moved = false;
      axis = null;
      dragAccum = 0;
      dragStepsFired = 0;
    },
    move(x, y) {
      if (!active) return [];
      const totalDx = x - startX;
      const totalDy = y - startY;
      if (!moved && Math.hypot(totalDx, totalDy) > tuning.tapMoveThresholdPx) {
        moved = true;
        commitAxis(totalDx, totalDy);
      }
      const fired: string[] = [];
      if (moved && axis !== null && dragBound[axis]) {
        const delta = axis === "horizontal" ? x - lastX : y - lastY;
        if (delta !== 0 && dragAccum !== 0 && Math.sign(delta) !== Math.sign(dragAccum)) dragAccum = 0;
        dragAccum += delta;
        while (Math.abs(dragAccum) >= dragStepPx) {
          const direction = Math.sign(dragAccum);
          const action = dragActionFor(direction);
          dragAccum -= direction * dragStepPx;
          if (action !== undefined) {
            fired.push(action);
            dragStepsFired += 1;
          }
        }
      }
      lastX = x;
      lastY = y;
      return fired;
    },
    end(x, y, nowMs) {
      if (!active) return [];
      active = false;
      const totalDx = x - startX;
      const totalDy = y - startY;
      const elapsed = nowMs - startTime;
      if (!moved) {
        if (elapsed <= tuning.tapMaxMs && bindings.tap !== undefined) return [bindings.tap];
        return [];
      }
      const travel = Math.hypot(totalDx, totalDy);
      const velocity = elapsed <= 0 ? Infinity : travel / elapsed;
      if (travel < tuning.swipeMinPx || velocity < tuning.swipeMinVelocity) return [];
      const direction = axis === "horizontal" ? Math.sign(totalDx) : Math.sign(totalDy);
      if (axis !== null && dragBound[axis] && dragActionFor(direction) !== undefined) return [];
      const swipe = swipeFor(totalDx, totalDy);
      if (swipe === undefined || dragStepsFired > 0) return [];
      return [swipe];
    },
    cancel() {
      active = false;
    },
    isActive() {
      return active;
    },
  };
}
