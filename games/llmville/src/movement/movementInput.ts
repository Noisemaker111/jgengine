import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";

import { createLookChannel } from "@jgengine/core/input/lookChannel";
import { MAX_JUMP_OFFSET, type MovementKey } from "@jgengine/core/movement/movementModel";
import { engineActions, type GameEngine } from "@/runtime/gameEngine";
import { KEYBIND_ACTION, matchesKeybind, type AppKeybinds, type KeybindActionId } from "@/settings/settings";

/**
 * Movement input side: pointer-lock plumbing, keyboard/mouse capture, and the
 * per-frame look/jump pose channel. The pure key→intent model and kinematics
 * live in movement.ts.
 */

export const DOM_EVENT = {
  touchStart: "touchstart",
  beforeUnload: "beforeunload",
} as const;

/**
 * Maps a configurable keybind action onto the raw movement key the engine
 * stores. Several actions can resolve to the same key (e.g. crouch is bound to
 * both Control and C), so this is a list rather than a record.
 */
const MOVEMENT_ACTION_MAP: readonly { actionId: KeybindActionId; movementKey: MovementKey }[] = [
  { actionId: KEYBIND_ACTION.moveForward, movementKey: "w" },
  { actionId: KEYBIND_ACTION.moveLeft, movementKey: "a" },
  { actionId: KEYBIND_ACTION.moveBackward, movementKey: "s" },
  { actionId: KEYBIND_ACTION.moveRight, movementKey: "d" },
  { actionId: KEYBIND_ACTION.sprint, movementKey: "shift" },
  { actionId: KEYBIND_ACTION.crouch, movementKey: "control" },
  { actionId: KEYBIND_ACTION.crouch, movementKey: "c" },
  { actionId: KEYBIND_ACTION.jump, movementKey: "space" },
] as const;

/** Resolve a keyboard event to the movement key it drives, or null. */
export function resolveMovementKey(event: KeyboardEvent, keybinds: AppKeybinds): MovementKey | null {
  const matched = MOVEMENT_ACTION_MAP.find(({ actionId }) => matchesKeybind(event, keybinds[actionId]));
  return matched?.movementKey ?? null;
}

/**
 * Keys whose browser default we suppress so they drive the avatar instead of
 * scrolling the page (space) or triggering OS/browser chords (shift/control).
 */
export function shouldPreventMovementDefault(key: MovementKey): boolean {
  return key === "space" || key === "shift" || key === "control";
}

// --- Pointer lock + keyboard input (desktop play) ---
//
// BREADCRUMB — do not "simplify" this stack; these bugs keep coming back:
// 1. Never mount @react-three/drei PointerLockControls alongside this — duplicate
//    listeners cause SecurityError spam and broken look.
// 2. Never call exitPointerLock() on mouseup — look must stay engaged while locked.
// 3. Every <Html> in the live play Canvas MUST disable hit-testing or clicks land
//    on the portal div and requestPointerLock(canvas) fails (gesture was not on
//    canvas). drei only applies the pointerEvents *prop* when transform={true};
//    normal Html needs style={{ pointerEvents: "none" }} — set both to be safe.
// 4. Look path: mousemove → accumulateLookDeltas → PlayerMovementController
//    consumeLookDeltas. Do not rotate the camera anywhere else.
// 5. Do not exit pointer lock on window blur — the browser already releases lock on
//    tab-away; blur also fires spuriously and kills look mid-session.

// Look/jump pose is per-frame mutable state shared between the rAF-driven
// controller (writer) and presence sync (reader). It stays a module-level
// channel on purpose: routing it through the engine reducer would dispatch
// every frame for state no React subscriber reads.
const lookChannel = createLookChannel({ sensitivity: 0.002, maxVerticalOffset: MAX_JUMP_OFFSET });

/** Latest camera yaw (radians) — written each frame by the movement controller. */
export const setLookYaw = lookChannel.setYaw;
export const readLookYaw = lookChannel.readYaw;

/** Latest camera pitch (radians) — written each frame by the movement controller. */
export const setLookPitch = lookChannel.setPitch;
export const readLookPitch = lookChannel.readPitch;

/** Latest vertical jump offset (world units above ground) — written each frame by the movement controller. */
export const setJumpOffset = lookChannel.setVerticalOffset;
export const readJumpOffset = lookChannel.readVerticalOffset;

export const accumulateLookDelta = lookChannel.accumulate;

/** Returns yaw/pitch deltas for this frame and clears the accumulator. */
export const consumeLookDeltas = lookChannel.consume;

export function requestPointerLock(element?: HTMLElement | null) {
  const target = element ?? document.querySelector("canvas");
  if (!target || !(target instanceof HTMLElement)) return;

  try {
    const result = target.requestPointerLock();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err: unknown) => {
        if (err instanceof Error && err.name !== "SecurityError") {
          console.warn("Pointer lock request failed:", err);
        }
      });
    }
  } catch {
    // ignore
  }
}

export function exitPointerLock() {
  try {
    document.exitPointerLock();
  } catch {
    // ignore
  }
}

function blocksPointerLockCapture(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      '[data-no-pointer-lock="true"], .game-ui-interactive, button, a, input, textarea, select, [role="button"]',
    ),
  );
}

function resolvePlayCanvas(root?: ParentNode | null): HTMLCanvasElement | null {
  const scope = root ?? document;
  const canvas = scope.querySelector("canvas");
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function detectCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/** True on phone/tablet primary input — coarse pointer only (no hybrid latch). */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(detectCoarsePointer);

  useEffect(() => {
    const mql = window.matchMedia?.("(pointer: coarse)");
    const onChange = () => setIsTouch(detectCoarsePointer());

    mql?.addEventListener?.("change", onChange);
    return () => {
      mql?.removeEventListener?.("change", onChange);
    };
  }, []);

  return isTouch;
}

export interface MovementControls {
  isTouch: boolean;
  setMovementKey: (key: MovementKey, pressed: boolean) => void;
  onSessionMouseDown: (event: ReactMouseEvent) => void;
}

export function useMovementControls({
  engine,
  keybinds,
}: {
  engine: GameEngine;
  keybinds: AppKeybinds;
}): MovementControls {
  const isTouch = useIsTouchDevice();

  const setMovementKey = useCallback(
    (key: MovementKey, pressed: boolean) => {
      engine.dispatch(engineActions.setMovementKey(key, pressed));
    },
    [engine],
  );

  const onSessionMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      if (isTouch) return;
      if (blocksPointerLockCapture(event.target)) return;
      const canvas = resolvePlayCanvas(event.currentTarget);
      if (canvas) {
        canvas.focus({ preventScroll: true });
        requestPointerLock(canvas);
      }
    },
    [isTouch],
  );

  useEffect(() => {
    if (isTouch) return;

    let primaryButtonDown = false;
    let lastClientX = 0;
    let lastClientY = 0;

    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && (target.isContentEditable || target.closest('button, select, [data-chat-panel], [role="dialog"]') !== null));

    const handleKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const movementAction = typing ? null : resolveMovementKey(event, keybinds);
      if (movementAction !== null) {
        if (shouldPreventMovementDefault(movementAction)) event.preventDefault();
        engine.dispatch(engineActions.setMovementKey(movementAction, true));
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const movementKey = resolveMovementKey(event, keybinds);
      if (movementKey === null) return;
      if (shouldPreventMovementDefault(movementKey)) event.preventDefault();
      engine.dispatch(engineActions.setMovementKey(movementKey, false));
    };

    const handlePointerLockChange = () => {
      const pointerLocked = document.pointerLockElement !== null;
      if (pointerLocked && document.pointerLockElement instanceof HTMLCanvasElement) {
        document.pointerLockElement.focus();
      }
      engine.dispatch(engineActions.setPointerLock(pointerLocked));
    };

    const beginLookCapture = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (blocksPointerLockCapture(event.target)) return;
      const canvas =
        event.target instanceof HTMLCanvasElement
          ? event.target
          : event.target instanceof Element
            ? event.target.closest("canvas")
            : null;
      const playCanvas = canvas instanceof HTMLCanvasElement ? canvas : resolvePlayCanvas();
      if (!playCanvas) return;

      primaryButtonDown = true;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      playCanvas.focus({ preventScroll: true });
      if (document.pointerLockElement === null) {
        requestPointerLock(playCanvas);
      }
    };

    const endLookCapture = (event: MouseEvent) => {
      if (event.button === 0) {
        primaryButtonDown = false;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) return;
      primaryButtonDown = false;
      // Browser releases pointer lock on tab-away; do not call exitPointerLock here.
      engine.dispatch(engineActions.resetMovementKeys());
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement) {
        accumulateLookDelta(event.movementX, event.movementY);
        return;
      }
      if (!primaryButtonDown) return;
      const dx = event.clientX - lastClientX;
      const dy = event.clientY - lastClientY;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      if (dx !== 0 || dy !== 0) {
        accumulateLookDelta(dx, dy);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", beginLookCapture);
    window.addEventListener("mouseup", endLookCapture);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", beginLookCapture);
      window.removeEventListener("mouseup", endLookCapture);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [engine, isTouch, keybinds]);

  return { isTouch, setMovementKey, onSessionMouseDown };
}
