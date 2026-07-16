import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useEffect, useRef, useState } from "react";
import type { Group } from "three";

/** Active TransformControls mode for the runtime selection gizmo. */
export type TransformGizmoMode = "translate" | "rotate" | "scale";
/** Snap policy: grid quantize, free drag, or ground-height sample on release. */
export type TransformGizmoSnap = "grid" | "free" | "ground";

/** Pose reported by {@link TransformGizmo} when the user releases a drag. */
export interface TransformGizmoPose {
  position: { x: number; y: number; z: number };
  rotationY: number;
  scale: { x: number; y: number; z: number };
}

/** Props for the shared runtime/editor selection gizmo. */
export interface TransformGizmoProps {
  position: { x: number; y: number; z: number };
  rotationY?: number;
  mode?: TransformGizmoMode;
  snapMode?: TransformGizmoSnap;
  gridSize?: number;
  /** Vertical offset so the gizmo sits above ground markers. */
  lift?: number;
  size?: number;
  groundSnap?: (x: number, z: number) => number;
  /** Disable orbit/pan while dragging (shell/editor cameras). */
  onDraggingChange?: (dragging: boolean) => void;
  onRelease: (pose: TransformGizmoPose) => void;
}

/**
 * Runtime selection/move gizmo shared by games and the editor.
 * Wraps TransformControls; callers own selection and commit side-effects.
 * @capability transform-gizmo in-game select/move/rotate/scale gizmo
 */
export const TransformGizmo = memo(function TransformGizmo({
  position,
  rotationY = 0,
  mode = "translate",
  snapMode = "free",
  gridSize = 1,
  lift = 0,
  size = 0.85,
  groundSnap,
  onDraggingChange,
  onRelease,
}: TransformGizmoProps) {
  const groupRef = useRef<Group>(null);
  const [object, setObject] = useState<Group | null>(null);
  const draggingRef = useRef(false);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;
  const anchorKey = `${position.x}:${position.y}:${position.z}:${rotationY}:${mode}`;

  useEffect(() => {
    setObject(groupRef.current);
  }, [anchorKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (group === null || draggingRef.current) return;
    group.position.set(position.x, position.y + lift, position.z);
    group.rotation.set(0, rotationY, 0);
    group.scale.set(1, 1, 1);
  }, [position.x, position.y, position.z, rotationY, lift, anchorKey, mode]);

  const snapProps =
    snapMode === "grid"
      ? { translationSnap: gridSize, rotationSnap: Math.PI / 12 }
      : { rotationSnap: Math.PI / 12 };

  const handleRelease = () => {
    draggingRef.current = false;
    if (controls !== null && "enabled" in controls) controls.enabled = true;
    onDraggingChange?.(false);
    const current = groupRef.current;
    if (current === null) return;
    let y = current.position.y - lift;
    if (snapMode === "ground" && groundSnap !== undefined) {
      y = groundSnap(current.position.x, current.position.z);
      current.position.y = y + lift;
    }
    onRelease({
      position: { x: current.position.x, y, z: current.position.z },
      rotationY: current.rotation.y,
      scale: { x: current.scale.x, y: current.scale.y, z: current.scale.z },
    });
  };

  return (
    <>
      <group ref={groupRef} />
      {object !== null ? (
        <TransformControls
          object={object}
          mode={mode}
          size={size}
          {...snapProps}
          onMouseDown={() => {
            draggingRef.current = true;
            if (controls !== null && "enabled" in controls) controls.enabled = false;
            onDraggingChange?.(true);
          }}
          onMouseUp={handleRelease}
        />
      ) : null}
    </>
  );
});
