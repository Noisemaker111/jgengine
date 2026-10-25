import type { MovementControls } from "@/movement/movementInput";
import { TouchControls } from "@/movement/components/TouchControls";
import { useTabletNavContext } from "@/tablet/components/tabletNav";

interface MovementHudProps {
  controls: MovementControls;
}

/**
 * On-screen walk + jump controls (touch only). Interaction is not a button:
 * tap or long-press the world itself (see TouchLookController). The tablet opens
 * via the swipe-up peek handle.
 */
export function MovementHud({ controls }: MovementHudProps) {
  const { tabletOpen, rackMenuOverlayRackId } = useTabletNavContext();
  const controlsVisible = !tabletOpen && rackMenuOverlayRackId === null;

  return controlsVisible ? (
    <TouchControls onMoveKey={controls.setMovementKey} className="absolute inset-0" />
  ) : null;
}
