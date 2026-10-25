import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Euler } from "three";

import { createTouchGestureTracker } from "@jgengine/core/input/touchGestures";
import { DOM_EVENT } from "@/movement/movementInput";

const LOOK_SENSITIVITY = 0.0042;
const PITCH_LIMIT = 1.45;

/** A finger that moves less than this and lifts quickly is a tap, not a look-drag. */
const TAP_MOVE_THRESHOLD_PX = 12;
const TAP_MAX_MS = 320;
/** Hold this long without moving to start a hold-interact (e.g. a garage door). */
const LONG_PRESS_MS = 420;

interface TouchLookControllerProps {
  enabled: boolean;
  /** Quick tap on the world → interact with whatever is targeted. */
  onTap?: () => void;
  /** Long-press begins / ends a hold-interact. */
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}

/**
 * Touch replacement for PointerLockControls: drag anywhere on the canvas to look
 * around, tap to interact, long-press to hold-interact. Runs inside the R3F
 * Canvas so it can rotate the live camera; the movement controller keeps owning
 * camera position + look persistence.
 *
 * One touch stream drives look, tap, and hold so they never fight: movement past
 * the tap threshold commits the gesture to "look" and cancels tap/hold; a still
 * finger that lifts quickly is a tap; a still finger held past the threshold is a
 * hold. The on-screen D-pad and buttons are DOM elements above the canvas, so
 * their touches never reach this listener.
 */
export function TouchLookController({ enabled, onTap, onHoldStart, onHoldEnd }: TouchLookControllerProps) {
  const { camera, gl } = useThree();

  // Keep the latest callbacks without re-subscribing the touch listeners.
  const handlers = useRef({ onTap, onHoldStart, onHoldEnd });
  handlers.current = { onTap, onHoldStart, onHoldEnd };

  useEffect(() => {
    if (!enabled) return;

    const element = gl.domElement;
    const previousTouchAction = element.style.touchAction;
    element.style.touchAction = "none";

    const euler = new Euler(0, 0, 0, "YXZ");
    const tracker = createTouchGestureTracker({
      tapMoveThresholdPx: TAP_MOVE_THRESHOLD_PX,
      tapMaxMs: TAP_MAX_MS,
      longPressMs: LONG_PRESS_MS,
    });
    let activeId: number | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const findActive = (list: TouchList): Touch | null => {
      for (let i = 0; i < list.length; i++) {
        const touch = list.item(i);
        if (touch && touch.identifier === activeId) return touch;
      }
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (activeId !== null) return;
      const touch = event.changedTouches.item(0);
      if (!touch) return;
      activeId = touch.identifier;
      tracker.begin(touch.clientX, touch.clientY, performance.now());
      clearLongPress();
      longPressTimer = setTimeout(() => {
        if (tracker.beginHold()) {
          handlers.current.onHoldStart?.();
        }
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (activeId === null) return;
      const touch = findActive(event.touches) ?? findActive(event.changedTouches);
      if (!touch) return;
      event.preventDefault();

      const delta = tracker.move(touch.clientX, touch.clientY);
      if (!delta) return;

      euler.setFromQuaternion(camera.quaternion);
      euler.y -= delta.dx * LOOK_SENSITIVITY;
      euler.x -= delta.dy * LOOK_SENSITIVITY;
      euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (activeId === null) return;
      if (!findActive(event.changedTouches)) return;
      clearLongPress();

      const gesture = tracker.end(performance.now());
      if (gesture === "hold-end") {
        handlers.current.onHoldEnd?.();
      } else if (gesture === "tap") {
        handlers.current.onTap?.();
      }
      activeId = null;
    };

    const onTouchCancel = () => {
      clearLongPress();
      if (tracker.cancel() === "hold-end") {
        handlers.current.onHoldEnd?.();
      }
      activeId = null;
    };

    element.addEventListener(DOM_EVENT.touchStart, onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      clearLongPress();
      if (tracker.cancel() === "hold-end") {
        handlers.current.onHoldEnd?.();
      }
      element.style.touchAction = previousTouchAction;
      element.removeEventListener(DOM_EVENT.touchStart, onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, camera, gl]);

  return null;
}
