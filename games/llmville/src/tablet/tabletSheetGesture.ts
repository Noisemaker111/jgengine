import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export const TABLET_OPEN_TRANSLATE_PERCENT = 8;
export const TABLET_CLOSED_TRANSLATE_PERCENT = 88;
export const TABLET_TOUCH_OPEN_TRANSLATE_PERCENT = 0;
export const TABLET_TOUCH_CLOSED_TRANSLATE_PERCENT = 90;

const TAP_MOVE_THRESHOLD_PX = 10;
const DISMISS_DRAG_THRESHOLD_PX = 48;
const DISMISS_VELOCITY_PX_MS = 0.35;
const OPEN_DRAG_THRESHOLD_PX = 48;
const OPEN_VELOCITY_PX_MS = -0.35;

/** Finger moves down (positive deltaY) to pull the sheet off-screen. */
function shouldDismissTabletSwipe(deltaY: number, velocity: number): boolean {
  return deltaY > DISMISS_DRAG_THRESHOLD_PX || (deltaY > 16 && velocity > DISMISS_VELOCITY_PX_MS);
}

function shouldOpenTabletSwipe(deltaY: number, velocity: number): boolean {
  return deltaY < -OPEN_DRAG_THRESHOLD_PX || (deltaY < -16 && velocity < OPEN_VELOCITY_PX_MS);
}

type SheetDragDirection = "open" | "dismiss";

interface DragState {
  pointerId: number;
  startClientY: number;
  startTranslatePercent: number;
  lastClientY: number;
  lastTime: number;
  moved: boolean;
  direction: SheetDragDirection;
}

interface UseTabletSheetDragParams {
  enabled: boolean;
  direction: SheetDragDirection;
  shellRef: RefObject<HTMLElement | null>;
  startTranslatePercent: number;
  onComplete: () => void;
  openTranslatePercent?: number;
  closedTranslatePercent?: number;
}

function useTabletSheetDrag({
  enabled,
  direction,
  shellRef,
  startTranslatePercent,
  onComplete,
  openTranslatePercent = TABLET_OPEN_TRANSLATE_PERCENT,
  closedTranslatePercent = TABLET_CLOSED_TRANSLATE_PERCENT,
}: UseTabletSheetDragParams) {
  const [dragTranslatePercent, setDragTranslatePercent] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const shellHeight = useCallback(() => shellRef.current?.getBoundingClientRect().height ?? 640, [shellRef]);

  const finishDrag = useCallback(
    (shouldComplete: boolean) => {
      dragRef.current = null;
      setDragTranslatePercent(null);
      if (shouldComplete) onComplete();
    },
    [onComplete],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some browsers reject capture on certain targets.
      }
      const now = performance.now();
      dragRef.current = {
        pointerId: event.pointerId,
        startClientY: event.clientY,
        startTranslatePercent: dragTranslatePercent ?? startTranslatePercent,
        lastClientY: event.clientY,
        lastTime: now,
        moved: false,
        direction,
      };
    },
    [direction, dragTranslatePercent, enabled, startTranslatePercent],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!enabled || drag === null || drag.pointerId !== event.pointerId) return;

      const deltaY = event.clientY - drag.startClientY;
      if (Math.abs(deltaY) > TAP_MOVE_THRESHOLD_PX) drag.moved = true;

      const deltaPercent = (deltaY / shellHeight()) * 100;
      const next = Math.min(
        closedTranslatePercent,
        Math.max(openTranslatePercent, drag.startTranslatePercent + deltaPercent),
      );
      setDragTranslatePercent(next);

      drag.lastClientY = event.clientY;
      drag.lastTime = performance.now();
    },
    [closedTranslatePercent, enabled, openTranslatePercent, shellHeight],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!enabled || drag === null || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const deltaY = event.clientY - drag.startClientY;
      const elapsedMs = Math.max(performance.now() - drag.lastTime, 1);
      const velocity = (event.clientY - drag.lastClientY) / elapsedMs;

      if (!drag.moved) {
        finishDrag(true);
        return;
      }

      const shouldComplete =
        direction === "dismiss"
          ? shouldDismissTabletSwipe(deltaY, velocity)
          : shouldOpenTabletSwipe(deltaY, velocity);
      finishDrag(shouldComplete);
    },
    [direction, enabled, finishDrag],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishDrag(false);
    },
    [finishDrag],
  );

  return {
    dragTranslatePercent,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}

interface UseTabletSheetGesturesParams {
  shellRef: RefObject<HTMLElement | null>;
  collapsed: boolean;
  dismissEnabled: boolean;
  peekEnabled: boolean;
  onDismiss: () => void;
  onOpen: () => void;
  openTranslatePercent?: number;
  closedTranslatePercent?: number;
}

/** Sheet drag for notch dismiss (open sheet) and bottom peek open (collapsed sheet). */
export function useTabletSheetGestures({
  shellRef,
  collapsed,
  dismissEnabled,
  peekEnabled,
  onDismiss,
  onOpen,
  openTranslatePercent = TABLET_OPEN_TRANSLATE_PERCENT,
  closedTranslatePercent = TABLET_CLOSED_TRANSLATE_PERCENT,
}: UseTabletSheetGesturesParams) {
  const dismiss = useTabletSheetDrag({
    enabled: dismissEnabled,
    direction: "dismiss",
    shellRef,
    startTranslatePercent: openTranslatePercent,
    onComplete: onDismiss,
    openTranslatePercent,
    closedTranslatePercent,
  });
  const peek = useTabletSheetDrag({
    enabled: peekEnabled,
    direction: "open",
    shellRef,
    startTranslatePercent: closedTranslatePercent,
    onComplete: onOpen,
    openTranslatePercent,
    closedTranslatePercent,
  });

  return {
    shellTranslatePercent:
      dismiss.dragTranslatePercent
      ?? peek.dragTranslatePercent
      ?? (collapsed ? closedTranslatePercent : openTranslatePercent),
    shellDragging: dismiss.dragTranslatePercent !== null || peek.dragTranslatePercent !== null,
    dismissHandle: {
      onPointerDown: dismiss.onPointerDown,
      onPointerMove: dismiss.onPointerMove,
      onPointerUp: dismiss.onPointerUp,
      onPointerCancel: dismiss.onPointerCancel,
    },
    peekHandle: {
      onPointerDown: peek.onPointerDown,
      onPointerMove: peek.onPointerMove,
      onPointerUp: peek.onPointerUp,
      onPointerCancel: peek.onPointerCancel,
    },
  };
}
