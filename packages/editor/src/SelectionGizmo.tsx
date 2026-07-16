import { TransformControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Group } from "three";

import type { EditorSession, EditorVec3 } from "@jgengine/core/editor/index";
import {
  findEditorMarker,
  findEditorNote,
  findEditorPath,
  findEditorVolume,
} from "@jgengine/core/editor/index";

import type { EditorHostApi } from "./session";
import { newPlacementId, type EditorUiState, type EditorUiStore, type GizmoMode, type SnapMode } from "./uiStore";
import { useStoreSelector } from "./useStoreSelector";

export type { GizmoMode } from "./uiStore";

const CLICK_SLOP_PX = 5;
const SCREEN_PICK_RADIUS_PX = 22;
const PATH_HANDLE_RADIUS_PX = 14;
const MARKER_LIFT = 1.2;
const NOTE_LIFT = 1;
const SELECT_TAGS = ["jgEditorId", "jgEntityId", "jgObjectId"] as const;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

interface GizmoUiSlice {
  gizmoMode: GizmoMode;
  snapMode: SnapMode;
  gridSize: number;
  pathPoint: { pathId: string; index: number } | null;
}

function selectGizmoUi(state: EditorUiState): GizmoUiSlice {
  return { gizmoMode: state.gizmoMode, snapMode: state.snapMode, gridSize: state.gridSize, pathPoint: state.pathPoint };
}

function gizmoUiEqual(a: GizmoUiSlice, b: GizmoUiSlice): boolean {
  return a.gizmoMode === b.gizmoMode && a.snapMode === b.snapMode && a.gridSize === b.gridSize && a.pathPoint === b.pathPoint;
}

/** Reads only the gizmo-relevant UI slice (mode, snap, path-point anchor) — skips re-render on
 * unrelated UI churn (sculpt/paint drags, tool switches, placement) that the old blanket
 * `ui.subscribe` force-update re-rendered the gizmo for. */
function useGizmoUiState(ui: EditorUiStore): GizmoUiSlice {
  return useStoreSelector(ui, selectGizmoUi, gizmoUiEqual);
}

function vecEqual(a: EditorVec3, b: EditorVec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function pathCentroid(points: readonly EditorVec3[]): EditorVec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n, z: z / n };
}

function isEditorOverlayNode(node: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current !== null) {
    if (current.type.startsWith("TransformControls")) return true;
    for (const tag of SELECT_TAGS) {
      if (typeof current.userData[tag] === "string") return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Canvas click-to-select and click-to-place. Document objects pick by screen proximity
 * (registration always matches what you see) with click-cycling through stacked candidates
 * and shift/ctrl additive selection; everything else picks by occlusion-ordered raycast
 * against the tagged scene graph. When a placement tool is armed, clicks author new
 * markers, volumes, notes, or path points at the ground hit instead of selecting.
 */
export const ViewportSelect = memo(function ViewportSelect({ api, ui }: { api: EditorHostApi; ui: EditorUiStore }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const projected = new THREE.Vector3();
    const planeHit = new THREE.Vector3();
    let down: { x: number; y: number } | null = null;

    const session = () => api.getSession();
    const screenDistance = (
      point: EditorVec3,
      lift: number,
      clickX: number,
      clickY: number,
      rect: DOMRect,
    ): number | null => {
      projected.set(point.x, point.y + lift, point.z).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      const px = (projected.x * 0.5 + 0.5) * rect.width;
      const py = (-projected.y * 0.5 + 0.5) * rect.height;
      return Math.hypot(px - clickX, py - clickY);
    };

    const groundPoint = (clickX: number, clickY: number, rect: DOMRect): EditorVec3 | null => {
      ndc.set((clickX / rect.width) * 2 - 1, -(clickY / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        if (!(hit.object as THREE.Mesh).isMesh || hit.object.visible === false) continue;
        if (isEditorOverlayNode(hit.object)) continue;
        return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      }
      if (raycaster.ray.intersectPlane(GROUND_PLANE, planeHit) !== null) {
        return { x: planeHit.x, y: planeHit.y, z: planeHit.z };
      }
      return null;
    };

    const place = (point: EditorVec3, keepTool: boolean) => {
      const placement = ui.getState().placement;
      if (placement === null) return;
      if (placement.tool === "path") {
        ui.pushDraftPoint(point);
        return;
      }
      if (placement.tool === "marker") {
        session().dispatch({
          type: "addMarker",
          marker: {
            id: newPlacementId(placement.kind),
            kind: placement.kind,
            position: point,
            label: placement.kind,
          },
        });
      } else if (placement.tool === "volume") {
        session().dispatch({
          type: "addVolume",
          volume: {
            id: newPlacementId(placement.kind),
            kind: placement.kind,
            shape: placement.shape,
            center: point,
            ...(placement.shape === "box" ? { halfExtents: { x: 8, y: 4, z: 8 } } : { radius: 10 }),
            ...(placement.shape === "cylinder" ? { height: 8 } : {}),
            label: placement.kind,
          },
        });
      } else {
        session().dispatch({
          type: "addNote",
          note: {
            id: newPlacementId("note"),
            text: "New note",
            position: point,
          },
        });
      }
      if (!keepTool) ui.cancelPlacement();
    };

    const onDown = (event: PointerEvent) => {
      if (ui.getState().tool === "terrain") return;
      if (event.button === 0) down = { x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      if (ui.getState().tool === "terrain") return;
      if (event.button !== 0 || down === null) return;
      const start = down;
      down = null;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;

      if (ui.getState().placement !== null) {
        const point = groundPoint(clickX, clickY, rect);
        if (point !== null) place(point, event.shiftKey || ui.getState().placement?.tool === "path");
        return;
      }

      const state = session().getState();
      const visibility = api.getVisibility();
      const selection = state.selection;

      const selectedPathId = selection.length === 1 ? selection[0] : undefined;
      const selectedPath =
        selectedPathId === undefined ? undefined : findEditorPath(state.document, selectedPathId);
      if (selectedPath !== undefined) {
        let bestIndex = -1;
        let bestHandle = PATH_HANDLE_RADIUS_PX;
        selectedPath.points.forEach((point, index) => {
          const distance = screenDistance(point, 0.8, clickX, clickY, rect);
          if (distance !== null && distance < bestHandle) {
            bestHandle = distance;
            bestIndex = index;
          }
        });
        if (bestIndex >= 0) {
          ui.patch({ pathPoint: { pathId: selectedPath.id, index: bestIndex } });
          return;
        }
      }

      const candidates: { id: string; distance: number }[] = [];
      const consider = (id: string, kind: string, point: EditorVec3, lift: number) => {
        if (visibility[kind] === false) return;
        const distance = screenDistance(point, lift, clickX, clickY, rect);
        if (distance !== null && distance < SCREEN_PICK_RADIUS_PX) candidates.push({ id, distance });
      };
      for (const marker of state.document.markers) consider(marker.id, marker.kind, marker.position, MARKER_LIFT);
      for (const volume of state.document.volumes) consider(volume.id, volume.kind, volume.center, 0);
      for (const note of state.document.annotations) consider(note.id, "note", note.position, NOTE_LIFT);
      for (const path of state.document.paths) {
        if (visibility[path.kind] === false) continue;
        let best: number | null = null;
        for (const point of path.points) {
          const distance = screenDistance(point, 0.8, clickX, clickY, rect);
          if (distance !== null && distance < SCREEN_PICK_RADIUS_PX && (best === null || distance < best)) {
            best = distance;
          }
        }
        if (best !== null) candidates.push({ id: path.id, distance: best });
      }
      candidates.sort((a, b) => a.distance - b.distance);

      if (candidates.length > 0) {
        let pickedId = candidates[0]!.id;
        const primary = selection[0];
        if (!additive && primary !== undefined) {
          const at = candidates.findIndex((candidate) => candidate.id === primary);
          if (at >= 0) pickedId = candidates[(at + 1) % candidates.length]!.id;
        }
        if (additive) {
          const next = selection.includes(pickedId)
            ? selection.filter((id) => id !== pickedId)
            : [...selection, pickedId];
          session().dispatch({ type: "select", ids: next });
        } else {
          session().dispatch({ type: "select", ids: [pickedId] });
        }
        ui.patch({ pathPoint: null });
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
          if (additive) {
            const next = selection.includes(taggedId)
              ? selection.filter((id) => id !== taggedId)
              : [...selection, taggedId];
            session().dispatch({ type: "select", ids: next });
          } else {
            session().dispatch({ type: "select", ids: [taggedId] });
          }
          ui.patch({ pathPoint: null });
          return;
        }
        break;
      }
      if (!additive) {
        ui.patch({ pathPoint: null });
        if (selection.length > 0) session().dispatch({ type: "clearSelection" });
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, scene, api, ui]);

  return null;
});

interface GizmoTarget {
  position: EditorVec3;
  lift: number;
  rotationY: number;
  kind: "marker" | "volume" | "path" | "note" | "pathPoint";
}

function resolveTarget(
  session: EditorSession,
  selectedId: string | undefined,
  pathPoint: { pathId: string; index: number } | null,
): GizmoTarget | null {
  const { document } = session.getState();
  if (pathPoint !== null) {
    const path = findEditorPath(document, pathPoint.pathId);
    const point = path?.points[pathPoint.index];
    if (point !== undefined) return { position: point, lift: 0.8, rotationY: 0, kind: "pathPoint" };
  }
  if (selectedId === undefined) return null;
  const marker = findEditorMarker(document, selectedId);
  if (marker !== undefined) {
    return { position: marker.position, lift: MARKER_LIFT, rotationY: marker.rotationY ?? 0, kind: "marker" };
  }
  const volume = findEditorVolume(document, selectedId);
  if (volume !== undefined) return { position: volume.center, lift: 0, rotationY: 0, kind: "volume" };
  const path = findEditorPath(document, selectedId);
  if (path !== undefined && path.points.length > 0) {
    return { position: pathCentroid(path.points), lift: 0.8, rotationY: 0, kind: "path" };
  }
  const note = findEditorNote(document, selectedId);
  if (note !== undefined) return { position: note.position, lift: NOTE_LIFT, rotationY: 0, kind: "note" };
  return null;
}

function effectiveMode(mode: GizmoMode, kind: GizmoTarget["kind"]): GizmoMode {
  if (kind === "marker") return mode === "scale" ? "translate" : mode;
  if (kind === "volume") return mode === "rotate" ? "translate" : mode;
  return "translate";
}

/**
 * Drag-to-transform gizmo bound to the current selection, dispatching editor commands on
 * release. Translating with a multi-selection moves every selected object by the drag delta;
 * scaling a volume resizes its true shape (radius, height, or box half-extents); a selected
 * path vertex moves just that point. Snapping follows the UI store: terrain height, grid
 * quantization, or free movement.
 */
export const SelectionGizmo = memo(function SelectionGizmo({
  session,
  ui,
  groundSnap,
}: {
  session: EditorSession;
  ui: EditorUiStore;
  groundSnap?: (x: number, z: number) => number;
}) {
  const groupRef = useRef<Group>(null);
  const [object, setObject] = useState<Group | null>(null);
  const draggingRef = useRef(false);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;
  const uiState = useGizmoUiState(ui);
  const state = session.getState();
  const selectedId = state.selection[0];
  const target = useMemo(
    () => resolveTarget(session, selectedId, uiState.pathPoint),
    [state, selectedId, uiState.pathPoint, session],
  );
  const mode = target === null ? "translate" : effectiveMode(uiState.gizmoMode, target.kind);
  const anchorKey = uiState.pathPoint === null ? selectedId : `${uiState.pathPoint.pathId}:${uiState.pathPoint.index}`;

  useEffect(() => {
    setObject(groupRef.current);
  }, [anchorKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (group === null || target === null) return;
    if (draggingRef.current) return;
    group.position.set(target.position.x, target.position.y + target.lift, target.position.z);
    group.rotation.set(0, target.rotationY, 0);
    group.scale.set(1, 1, 1);
  }, [target?.position.x, target?.position.y, target?.position.z, target?.rotationY, anchorKey, mode]);

  if (target === null) return null;

  const snapProps =
    uiState.snapMode === "grid"
      ? { translationSnap: uiState.gridSize, rotationSnap: Math.PI / 12 }
      : { rotationSnap: Math.PI / 12 };

  const onRelease = () => {
    draggingRef.current = false;
    if (controls !== null && "enabled" in controls) controls.enabled = true;
    const current = groupRef.current;
    if (current === null) return;
    const dropped: EditorVec3 = {
      x: current.position.x,
      y: current.position.y - target.lift,
      z: current.position.z,
    };
    if (
      mode === "translate" &&
      uiState.snapMode === "ground" &&
      groundSnap !== undefined &&
      target.kind !== "path"
    ) {
      dropped.y = groundSnap(dropped.x, dropped.z);
      current.position.y = dropped.y + target.lift;
    }

    if (target.kind === "pathPoint" && uiState.pathPoint !== null) {
      const path = findEditorPath(session.getState().document, uiState.pathPoint.pathId);
      if (path === undefined) return;
      const original = path.points[uiState.pathPoint.index];
      if (original !== undefined && vecEqual(original, dropped)) return;
      const points = path.points.map((point, index) =>
        index === uiState.pathPoint!.index ? dropped : point,
      );
      session.dispatch({ type: "setPath", id: path.id, patch: { points } });
      return;
    }

    if (mode === "scale" && target.kind === "volume" && selectedId !== undefined) {
      const volume = findEditorVolume(session.getState().document, selectedId);
      if (volume === undefined) return;
      const sx = Math.abs(current.scale.x);
      const sy = Math.abs(current.scale.y);
      const sz = Math.abs(current.scale.z);
      if (sx === 1 && sy === 1 && sz === 1 && vecEqual(dropped, volume.center)) return;
      if (volume.shape === "box" && volume.halfExtents !== undefined) {
        session.dispatch({
          type: "setVolume",
          id: selectedId,
          patch: {
            center: dropped,
            halfExtents: {
              x: Math.max(0.5, volume.halfExtents.x * sx),
              y: Math.max(0.5, volume.halfExtents.y * sy),
              z: Math.max(0.5, volume.halfExtents.z * sz),
            },
          },
        });
      } else {
        const radius = Math.max(0.5, (volume.radius ?? 5) * Math.max(sx, sz));
        session.dispatch({
          type: "setVolume",
          id: selectedId,
          patch: {
            center: dropped,
            radius,
            ...(volume.height === undefined ? {} : { height: Math.max(0.5, volume.height * sy) }),
          },
        });
      }
      return;
    }

    if (mode === "rotate" && target.kind === "marker" && selectedId !== undefined) {
      if (vecEqual(dropped, target.position) && current.rotation.y === target.rotationY) return;
      session.dispatch({
        type: "setTransform",
        id: selectedId,
        position: dropped,
        rotationY: current.rotation.y,
      });
      return;
    }

    const delta: EditorVec3 = {
      x: dropped.x - target.position.x,
      y: dropped.y - target.position.y,
      z: dropped.z - target.position.z,
    };
    if (state.selection.length > 1 || target.kind === "path") {
      if (delta.x === 0 && delta.y === 0 && delta.z === 0) return;
      session.dispatch({ type: "translate", ids: state.selection, delta });
      return;
    }
    if (selectedId === undefined) return;
    if (vecEqual(dropped, target.position)) return;
    session.dispatch({ type: "setTransform", id: selectedId, position: dropped });
  };

  return (
    <>
      <group ref={groupRef} />
      {object !== null ? (
        <TransformControls
          object={object}
          mode={mode}
          size={0.85}
          {...snapProps}
          onMouseDown={() => {
            draggingRef.current = true;
            if (controls !== null && "enabled" in controls) controls.enabled = false;
          }}
          onMouseUp={onRelease}
        />
      ) : null}
    </>
  );
});
