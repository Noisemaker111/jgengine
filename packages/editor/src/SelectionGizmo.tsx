import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Group } from "three";

import type { EditorSession } from "@jgengine/core/editor/index";

import type { EditorHostApi } from "./session";

/** Which transform gizmo is active for the current selection. */
export type GizmoMode = "translate" | "rotate" | "scale";

const CLICK_SLOP_PX = 5;
const SCREEN_PICK_RADIUS_PX = 22;
const SELECT_TAGS = ["jgEditorId", "jgEntityId", "jgObjectId"] as const;

/**
 * Canvas click-to-select. Document markers/volumes pick by screen proximity (registration always
 * matches what you see); everything else picks by occlusion-ordered raycast against the tagged
 * scene graph, so live entities and objects are clickable exactly like editor gizmos.
 */
export function ViewportSelect({ api }: { api: EditorHostApi }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const projected = new THREE.Vector3();
    let down: { x: number; y: number } | null = null;

    const select = (id: string) => {
      api.getSession().dispatch({ type: "select", ids: [id] });
    };
    const clear = () => {
      const session = api.getSession();
      if (session.getState().selection.length > 0) session.dispatch({ type: "clearSelection" });
    };
    const screenDistance = (
      x: number,
      y: number,
      z: number,
      clickX: number,
      clickY: number,
      rect: DOMRect,
    ): number | null => {
      projected.set(x, y, z).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      const px = (projected.x * 0.5 + 0.5) * rect.width;
      const py = (-projected.y * 0.5 + 0.5) * rect.height;
      return Math.hypot(px - clickX, py - clickY);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button === 0) down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (event.button !== 0 || down === null) return;
      const start = down;
      down = null;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const { document } = api.getSession().getState();
      const visibility = api.getVisibility();
      let bestId: string | null = null;
      let bestDistance = SCREEN_PICK_RADIUS_PX;
      for (const marker of document.markers) {
        if (visibility[marker.kind] === false) continue;
        const distance = screenDistance(
          marker.position.x,
          marker.position.y + 1.2,
          marker.position.z,
          clickX,
          clickY,
          rect,
        );
        if (distance !== null && distance < bestDistance) {
          bestDistance = distance;
          bestId = marker.id;
        }
      }
      if (bestId === null) {
        for (const volume of document.volumes) {
          if (visibility[volume.kind] === false) continue;
          const distance = screenDistance(volume.center.x, volume.center.y, volume.center.z, clickX, clickY, rect);
          if (distance !== null && distance < bestDistance) {
            bestDistance = distance;
            bestId = volume.id;
          }
        }
      }
      if (bestId !== null) {
        select(bestId);
        return;
      }

      ndc.set((clickX / rect.width) * 2 - 1, -(clickY / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (!(hit.object as THREE.Mesh).isMesh || hit.object.visible === false) continue;
        let node: THREE.Object3D | null = hit.object;
        let gizmoHit = false;
        let taggedId: string | null = null;
        while (node !== null && taggedId === null && !gizmoHit) {
          if (node.type.startsWith("TransformControls")) gizmoHit = true;
          for (const tag of SELECT_TAGS) {
            const id = node.userData[tag];
            if (typeof id === "string") {
              taggedId = id;
              break;
            }
          }
          node = node.parent;
        }
        if (gizmoHit) continue;
        if (taggedId !== null) {
          select(taggedId);
          return;
        }
        clear();
        return;
      }
      clear();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, scene, api]);

  return null;
}

/** Drag-to-transform gizmo bound to the current selection, dispatching editor commands on release. */
export function SelectionGizmo({
  session,
  mode,
  groundSnap,
}: {
  session: EditorSession;
  mode: GizmoMode;
  groundSnap?: (x: number, z: number) => number;
}) {
  const groupRef = useRef<Group>(null);
  const [object, setObject] = useState<Group | null>(null);
  const draggingRef = useRef(false);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;
  const state = session.getState();
  const selectedId = state.selection[0];
  const marker = state.document.markers.find((item) => item.id === selectedId);
  const volume = state.document.volumes.find((item) => item.id === selectedId);
  const target = marker?.position ?? volume?.center;

  useEffect(() => {
    setObject(groupRef.current);
  }, [selectedId]);

  useEffect(() => {
    const group = groupRef.current;
    if (group === null || target === undefined) return;
    if (draggingRef.current) return;
    group.position.set(target.x, target.y + (marker !== undefined ? 1.2 : 0), target.z);
    group.rotation.y = marker?.rotationY ?? 0;
    if (volume?.radius !== undefined) {
      const scale = Math.max(0.1, volume.radius / 10);
      group.scale.setScalar(scale);
    } else {
      group.scale.set(1, 1, 1);
    }
  }, [target?.x, target?.y, target?.z, marker, volume, selectedId]);

  if (selectedId === undefined || target === undefined) return null;

  return (
    <>
      <group ref={groupRef} />
      {object !== null ? (
        <TransformControls
          object={object}
          mode={mode}
          size={0.85}
          onMouseDown={() => {
            draggingRef.current = true;
            if (controls !== null && "enabled" in controls) controls.enabled = false;
          }}
          onMouseUp={() => {
            draggingRef.current = false;
            if (controls !== null && "enabled" in controls) controls.enabled = true;
            const current = groupRef.current;
            if (current === null) return;
            let x = current.position.x;
            let y = current.position.y - (marker !== undefined ? 1.2 : 0);
            let z = current.position.z;
            if (groundSnap !== undefined) {
              y = groundSnap(x, z);
              current.position.y = y + (marker !== undefined ? 1.2 : 0);
            }
            if (mode === "scale" && volume !== undefined) {
              const radius = Math.max(1, current.scale.x * 10);
              session.dispatch({
                type: "setVolume",
                id: selectedId,
                patch: { center: { x, y, z }, radius },
              });
              return;
            }
            if (mode === "rotate" && marker !== undefined) {
              session.dispatch({
                type: "setTransform",
                id: selectedId,
                position: { x, y, z },
                rotationY: current.rotation.y,
              });
              return;
            }
            session.dispatch({
              type: "setTransform",
              id: selectedId,
              position: { x, y, z },
            });
          }}
        />
      ) : null}
    </>
  );
}
