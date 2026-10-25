import { TouchLookController } from "@/movement/components/TouchLookController";

interface PlayLookProps {
  touchMode: boolean;
  /** Touch only: quick tap on the world interacts; long-press holds. */
  onTouchTap?: () => void;
  onTouchHoldStart?: () => void;
  onTouchHoldEnd?: () => void;
}

/**
 * Camera look:
 * - Touch: drag to look + interact (TouchLookController)
 * - Desktop: pointer lock + mousemove live in movement.ts (see BREADCRUMB there).
 *   PlayerMovementController consumes look deltas each frame.
 *   Do NOT add drei PointerLockControls here — see movement.ts BREADCRUMB.
 *   drei <Html> labels need style={{ pointerEvents: "none" }} (prop alone is not enough).
 */
export function PlayLook({ touchMode, onTouchTap, onTouchHoldStart, onTouchHoldEnd }: PlayLookProps) {
  if (touchMode) {
    return (
      <TouchLookController
        enabled
        onTap={onTouchTap}
        onHoldStart={onTouchHoldStart}
        onHoldEnd={onTouchHoldEnd}
      />
    );
  }

  // Desktop look is handled manually (see PlayerMovementController).
  return null;
}
