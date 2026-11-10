import { memo, useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { setCameraControlsEnabled } from "../camera/activeControls.draw";

/** Active TransformControls mode for the runtime selection gizmo. */
export type TransformGizmoMode = "translate" | "rotate" | "scale";
/** Snap policy: grid quantize, free drag, or ground-height sample on release. */
export type TransformGizmoSnap = "grid" | "free" | "ground";
/** Gizmo handle orientation: world axes, or the target's local (yaw-rotated) axes. */
export type TransformGizmoSpace = "world" | "local";

/** Default rotation snap increment (radians) when callers don't configure one. */
export const DEFAULT_ROTATION_SNAP = Math.PI / 12;

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
  /** Handle orientation; `"local"` aligns handles to the target's yaw. */
  space?: TransformGizmoSpace;
  /** Rotation snap increment in radians; `null` rotates freely. */
  rotationSnap?: number | null;
  /** Scale snap increment; `null` (default) scales freely. */
  scaleSnap?: number | null;
  /** Vertical offset so the gizmo sits above ground markers. */
  lift?: number;
  size?: number;
  groundSnap?: ((x: number, z: number) => number) | undefined;
  /** Disable orbit/pan while dragging (shell/editor cameras). */
  onDraggingChange?: (dragging: boolean) => void;
  onRelease: (pose: TransformGizmoPose) => void;
}

/**
 * Draw-side form of {@link TransformGizmo}: three's `TransformControls` attaches to an anchor
 * group; prop changes sync in `update`, drags suspend the registered camera rigs.
 * @internal
 */
export function transformGizmoDraw(getProps: () => TransformGizmoProps): EngineDraw {
  const group = new THREE.Group();
  let controls: TransformControls | null = null;
  let helper: THREE.Object3D | null = null;
  let dragging = false;
  let anchorKey = "";

  const syncProps = () => {
    const props = getProps();
    const ctl = controls;
    if (ctl === null) return;
    const mode = props.mode ?? "translate";
    const snapMode = props.snapMode ?? "free";
    const gridSize = props.gridSize ?? 1;
    const space = props.space ?? "world";
    const rotationSnap = props.rotationSnap === undefined ? DEFAULT_ROTATION_SNAP : props.rotationSnap;
    const scaleSnap = props.scaleSnap ?? null;
    const lift = props.lift ?? 0;
    const size = props.size ?? 0.85;
    if (ctl.mode !== mode) ctl.mode = mode;
    if (ctl.space !== space) ctl.space = space;
    if (ctl.size !== size) ctl.size = size;
    ctl.translationSnap = snapMode === "grid" ? gridSize : null;
    ctl.rotationSnap = rotationSnap;
    ctl.scaleSnap = scaleSnap;
    const key = `${props.position.x}:${props.position.y}:${props.position.z}:${props.rotationY ?? 0}:${mode}:${lift}`;
    if (!dragging && key !== anchorKey) {
      anchorKey = key;
      group.position.set(props.position.x, props.position.y + lift, props.position.z);
      group.rotation.set(0, props.rotationY ?? 0, 0);
      group.scale.set(1, 1, 1);
    }
  };

  const onMouseDown = () => {
    dragging = true;
    setCameraControlsEnabled(false);
    getProps().onDraggingChange?.(true);
  };
  const onMouseUp = () => {
    dragging = false;
    setCameraControlsEnabled(true);
    getProps().onDraggingChange?.(false);
    const props = getProps();
    const snapMode = props.snapMode ?? "free";
    const lift = props.lift ?? 0;
    let y = group.position.y - lift;
    if (snapMode === "ground" && props.groundSnap !== undefined) {
      y = props.groundSnap(group.position.x, group.position.z);
      group.position.y = y + lift;
    }
    props.onRelease({
      position: { x: group.position.x, y, z: group.position.z },
      rotationY: group.rotation.y,
      scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
    });
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      controls = new TransformControls(state.camera, state.gl.domElement);
      controls.size = getProps().size ?? 0.85;
      controls.addEventListener("mouseDown", onMouseDown);
      controls.addEventListener("mouseUp", onMouseUp);
      helper = controls.getHelper();
      state.scene.add(helper);
      controls.attach(group);
      syncProps();
    },
    update() {
      syncProps();
    },
    dispose(state: EngineFrameState) {
      controls?.removeEventListener("mouseDown", onMouseDown);
      controls?.removeEventListener("mouseUp", onMouseUp);
      controls?.detach();
      if (controls !== null) {
        if (helper !== null) state.scene.remove(helper);
        helper = null;
        controls.dispose();
      }
      controls = null;
      state.scene.remove(group);
      if (dragging) setCameraControlsEnabled(true);
      dragging = false;
    },
  };
}

/**
 * Runtime selection/move gizmo shared by games and the editor.
 * Wraps TransformControls; callers own selection and commit side-effects.
 * @capability transform-gizmo in-game select/move/rotate/scale gizmo
 */
export const TransformGizmo = memo(function TransformGizmo(props: TransformGizmoProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => transformGizmoDraw(() => latest.current), []);
  return null;
});
