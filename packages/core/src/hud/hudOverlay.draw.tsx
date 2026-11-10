// @skill jgengine-ui
import { useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Camera, Object3D } from "three";

import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";

/**
 * Fullscreen DOM overlay over the 3D canvas. drei's `<Html fullscreen>` while r3f still owns the
 * canvas (it portals out of the reconciler); a plain absolutely-positioned div once the engine
 * loop renders children into the shell's positioned wrapper. Samples are CSS px relative to the
 * canvas top-left either way.
 */
export function HudOverlay({ zIndex, children }: { zIndex: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex, pointerEvents: "none" }}>{children}</div>
  );
}

/**
 * A world-anchored DOM overlay: drei's `<Html position center>` while r3f owns the canvas; under
 * the engine loop a div projected to the anchor every frame, with `distanceFactor` scaling matched
 * to drei's `distanceFactor / (2·tan(fov/2)·distance)`. Hidden when the anchor leaves the frustum.
 */
export function AnchoredOverlay({
  position,
  anchor,
  localPosition,
  distanceFactor,
  zIndex = 0,
  children,
}: {
  /** World-space anchor. Mutually exclusive with `anchor`+`localPosition`. */
  position?: readonly [number, number, number] | undefined;
  /** Scene object the overlay follows; `localPosition` is its local offset. */
  anchor?: Object3D | undefined;
  localPosition?: readonly [number, number, number] | undefined;
  /** drei `distanceFactor`: scales the overlay with distance. Omit for constant screen size. */
  distanceFactor?: number | undefined;
  zIndex?: number | undefined;
  children: ReactNode;
}) {
  const node = useRef<HTMLDivElement | null>(null);
  const scratch = useRef(new THREE.Vector3());
  const local = useRef(new THREE.Vector3());
  const ndc = useRef(new THREE.Vector3());
  useFrameTask((state) => {
    const el = node.current;
    if (el === null) return;
    const camera = state.camera as Camera;
    camera.updateMatrixWorld();
    const size = state.size;
    let world: THREE.Vector3;
    if (anchor !== undefined && localPosition !== undefined) {
      anchor.updateWorldMatrix(true, false);
      world = anchor.localToWorld(local.current.set(localPosition[0], localPosition[1], localPosition[2]));
    } else if (position !== undefined) {
      world = scratch.current.set(position[0], position[1], position[2]);
    } else {
      return;
    }
    const behind = ndc.current.copy(world).project(camera);
    const offscreen = behind.z < -1 || behind.z > 1;
    el.style.display = offscreen ? "none" : "";
    if (offscreen) return;
    const sx = (behind.x * 0.5 + 0.5) * size.width;
    const sy = (-behind.y * 0.5 + 0.5) * size.height;
    let transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
    if (distanceFactor !== undefined) {
      const fovTan = camera instanceof THREE.PerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 0.5;
      const distance = camera.position.distanceTo(world);
      const scale = fovTan > 0 ? distanceFactor / (2 * fovTan * Math.max(distance, 0.001)) : 1;
      transform += ` scale(${scale})`;
    }
    el.style.transform = transform;
  });
  return (
    <div
      ref={node}
      style={{ position: "absolute", top: 0, left: 0, zIndex, pointerEvents: "none", transformOrigin: "center", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
