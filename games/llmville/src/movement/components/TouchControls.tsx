import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { MovementKey } from "@/runtime/gameEngine";
import { cn } from "@/components/ui/cn";
import { buttonVariants } from "@/components/ui/button";
import { UI_LAYER } from "@/runtime/uiLayers";

interface TouchControlsProps {
  /** Set a movement key pressed/released on the game engine. */
  onMoveKey: (key: MovementKey, pressed: boolean) => void;
  className?: string;
}

const DPAD_BUTTONS: { key: MovementKey; label: string; gridArea: string; arrow: string }[] = [
  { key: "w", label: "Move forward", gridArea: "up", arrow: "M12 5l-6 7h4v6h4v-6h4z" },
  { key: "a", label: "Move left", gridArea: "left", arrow: "M5 12l7-6v4h6v4h-6v4z" },
  { key: "d", label: "Move right", gridArea: "right", arrow: "M19 12l-7 6v-4H6v-4h6V6z" },
  { key: "s", label: "Move backward", gridArea: "down", arrow: "M12 19l6-7h-4V6h-4v6H6z" },
];

/** Upward "jump" chevron. */
const JUMP_ICON_PATH = "M12 4l7 8h-4v6H9v-6H5z";

function capturePointer(event: ReactPointerEvent<HTMLButtonElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Capture can fail on some mobile browsers; release handlers still run on pointerup.
  }
}

function releasePointer(event: ReactPointerEvent<HTMLButtonElement>) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

/**
 * On-screen controls for touch play: a movement D-pad on the left and a small
 * jump button on the right. There is no Interact button — tap or long-press the
 * world itself (see TouchLookController). Pointer capture keeps held keys
 * reliable while the finger drifts.
 */
export function TouchControls({ onMoveKey, className }: TouchControlsProps) {
  const heldKeys = useRef(new Set<MovementKey>());
  const onMoveKeyRef = useRef(onMoveKey);

  useEffect(() => {
    onMoveKeyRef.current = onMoveKey;
  }, [onMoveKey]);

  const press = useCallback(
    (key: MovementKey) => {
      if (heldKeys.current.has(key)) return;
      heldKeys.current.add(key);
      onMoveKey(key, true);
    },
    [onMoveKey],
  );

  const release = useCallback(
    (key: MovementKey) => {
      if (!heldKeys.current.has(key)) return;
      heldKeys.current.delete(key);
      onMoveKey(key, false);
    },
    [onMoveKey],
  );

  // Releasing held keys when the HUD hides (tablet opened, etc.) stops the
  // player from sliding on forever after the buttons disappear.
  useEffect(() => {
    const held = heldKeys.current;
    return () => {
      for (const key of held) onMoveKeyRef.current(key, false);
      held.clear();
    };
  }, []);

  const dpadButtonClass = cn(
    buttonVariants({ variant: "led" }),
    "game-ui-interactive flex h-full w-full items-center justify-center backdrop-blur-md active:scale-95",
  );

  return (
    <div
      className={cn("pointer-events-none select-none touch-none", className)}
      style={{ zIndex: UI_LAYER.touchControls }}
      data-ui-layer="touch-controls"
    >
      {/* Movement D-pad (left) */}
      <div
        data-ui-layer="movement-dpad"
        className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-[calc(env(safe-area-inset-left)+1.25rem)] grid h-40 w-40 gap-1.5"
        style={{
          gridTemplateAreas: '". up ." "left . right" ". down ."',
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
        }}
      >
        {DPAD_BUTTONS.map((button) => (
          <button
            key={button.key}
            type="button"
            aria-label={button.label}
            style={{ gridArea: button.gridArea }}
            className={dpadButtonClass}
            onPointerDown={(event) => {
              event.preventDefault();
              capturePointer(event);
              press(button.key);
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              release(button.key);
              releasePointer(event);
            }}
            onPointerCancel={(event) => {
              release(button.key);
              releasePointer(event);
            }}
            onLostPointerCapture={() => release(button.key)}
          >
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d={button.arrow} />
            </svg>
          </button>
        ))}
      </div>

      {/* Jump (right) — small icon button. */}
      <div
        data-ui-layer="jump-button"
        className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] flex items-end"
      >
        <button
          type="button"
          aria-label="Jump"
          onPointerDown={(event) => {
            event.preventDefault();
            capturePointer(event);
            press("space");
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            release("space");
            releasePointer(event);
          }}
          onPointerCancel={(event) => {
            release("space");
            releasePointer(event);
          }}
          onLostPointerCapture={() => release("space")}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "game-ui-interactive flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md active:scale-95",
          )}
        >
          <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d={JUMP_ICON_PATH} />
          </svg>
        </button>
      </div>
    </div>
  );
}
