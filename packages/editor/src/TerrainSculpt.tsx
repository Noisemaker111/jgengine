import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { EditorSession } from "@jgengine/core/editor/index";
import type { Aabb } from "@jgengine/core/world/geometry";
import {
  beginTerraformStroke,
  editableTerrainFromSnapshot,
  type EditableTerrain,
  type TerraformEdit,
  type TerraformSnapshot,
  type TerraformStroke,
} from "@jgengine/core/world/terraform";
import { useGameContext } from "@jgengine/react/provider";
import { TerraformBrushCursor } from "@jgengine/shell/terrain";

import type { EditorHostApi } from "./session";
import type { EditorUiStore, SculptSettings, TerrainBrushKind } from "./uiStore";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const LOW = new THREE.Color("#3f5d34");
const HIGH = new THREE.Color("#8f9c66");
const COLOR_SPAN = 24;

function segmentsFor(snapshot: TerraformSnapshot): number {
  return Math.max(8, Math.min(180, Math.max(snapshot.cols, snapshot.rows)));
}

function boundsKey(bounds: Aabb, segments: number): string {
  return `${bounds.minX}:${bounds.minZ}:${bounds.maxX}:${bounds.maxZ}:${segments}`;
}

/** Effective brush mode after the invert modifier flips raise↔lower. */
function effectiveBrush(brush: TerrainBrushKind, invert: boolean): TerrainBrushKind {
  if (!invert) return brush;
  if (brush === "raise") return "lower";
  if (brush === "lower") return "raise";
  return brush;
}

function editFromSettings(
  settings: SculptSettings,
  center: [number, number],
  clickHeight: number,
): TerraformEdit {
  const mode = effectiveBrush(settings.brush, settings.invert);
  const heightLimit =
    settings.heightLimit.min === null && settings.heightLimit.max === null
      ? undefined
      : {
          ...(settings.heightLimit.min === null ? {} : { min: settings.heightLimit.min }),
          ...(settings.heightLimit.max === null ? {} : { max: settings.heightLimit.max }),
        };
  return {
    mode,
    center,
    radius: settings.radius,
    strength: settings.strength,
    falloff: settings.falloff,
    shape: settings.shape,
    ...(mode === "flatten"
      ? { target: settings.flattenHeight ?? clickHeight }
      : {}),
    ...(mode === "noise" ? { seed: settings.noiseSeed } : {}),
    ...(heightLimit === undefined ? {} : { heightLimit }),
  };
}

/** Re-samples every vertex Y and vertex color from the live terrain (in place — no reallocation). */
function displace(geometry: THREE.BufferGeometry, terrain: EditableTerrain, bounds: Aabb): void {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  let colors = geometry.attributes.color as THREE.BufferAttribute | undefined;
  if (colors === undefined || colors.count !== position.count) {
    colors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
    geometry.setAttribute("color", colors);
  }
  const tone = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + cx;
    const z = position.getZ(index) + cz;
    const height = terrain.sampleHeight(x, z);
    position.setY(index, height);
    const t = Math.max(0, Math.min(1, (height + COLOR_SPAN * 0.25) / COLOR_SPAN));
    tone.copy(LOW).lerp(HIGH, t);
    colors.setXYZ(index, tone.r, tone.g, tone.b);
  }
  position.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function SculptMesh({
  terrain,
  bounds,
  segments,
  revision,
  meshRef,
}: {
  terrain: EditableTerrain;
  bounds: Aabb;
  segments: number;
  revision: number;
  meshRef: React.MutableRefObject<THREE.Mesh | null>;
}) {
  const geometry = useMemo(() => {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const depth = Math.max(1, bounds.maxZ - bounds.minZ);
    const geo = new THREE.PlaneGeometry(width, depth, segments, segments);
    geo.rotateX(-Math.PI / 2);
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey(bounds, segments)]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    displace(geometry, terrain, bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, terrain, revision]);

  return (
    <mesh ref={meshRef} geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

/**
 * Terrain-sculpt viewport layer: renders the editable heightfield and, while the terrain tool is
 * active, converts pointer drags into brush strokes. A whole drag batches into one
 * `sculptTerrain` command committed on release, so undo replays the stroke as a single step.
 */
export function TerrainSculpt({ api, ui }: { api: EditorHostApi; ui: EditorUiStore }) {
  const ctx = useGameContext();
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;
  const session: EditorSession = api.getSession();

  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => ui.subscribe(() => setTick((value) => value + 1)), [ui]);

  const snapshot = session.getState().document.terrain ?? null;
  const base = ctx.world.ground;
  const uiState = ui.getState();
  const toolActive = uiState.tool === "terrain";

  const editableRef = useRef<EditableTerrain | null>(null);
  const boundsRef = useRef<Aabb | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const syncedRef = useRef<TerraformSnapshot | null>(null);
  const gridKeyRef = useRef<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; z: number } | null>(null);

  const segments = snapshot === null ? 0 : segmentsFor(snapshot);
  const gridKey =
    snapshot === null ? null : `${boundsKey(snapshot.bounds, segments)}:${snapshot.cellSize}`;
  const refresh = () => setRevision((value) => value + 1);

  // Rebuild the live terrain when the grid changes; otherwise re-sync offsets on undo/redo/import.
  useEffect(() => {
    if (snapshot === null) {
      editableRef.current = null;
      boundsRef.current = null;
      gridKeyRef.current = null;
      syncedRef.current = null;
      return;
    }
    if (gridKeyRef.current !== gridKey || editableRef.current === null) {
      editableRef.current = editableTerrainFromSnapshot(snapshot, base);
      boundsRef.current = snapshot.bounds;
      gridKeyRef.current = gridKey;
    } else if (syncedRef.current !== snapshot) {
      editableRef.current.restore(snapshot);
    }
    syncedRef.current = snapshot;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, gridKey, base]);

  useEffect(() => {
    if (!toolActive || snapshot === null) {
      setCursor(null);
      return;
    }
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const planeHit = new THREE.Vector3();
    let stroke: TerraformStroke | null = null;
    let rampFrom: [number, number] | null = null;
    let clickHeight = 0;
    let last: [number, number] | null = null;

    const pick = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const mesh = meshRef.current;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (mesh !== null) {
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (hit !== undefined) return { x: hit.point.x, z: hit.point.z };
      }
      if (raycaster.ray.intersectPlane(GROUND_PLANE, planeHit) !== null) {
        return { x: planeHit.x, z: planeHit.z };
      }
      return null;
    };

    const setControls = (enabled: boolean) => {
      if (controls !== null && "enabled" in controls) controls.enabled = enabled;
    };

    const stamp = (point: { x: number; z: number }) => {
      const terrain = editableRef.current;
      if (terrain === null || stroke === null) return;
      stroke.stamp(editFromSettings(ui.getState().sculpt, [point.x, point.z], clickHeight));
      last = [point.x, point.z];
      refresh();
    };

    const onMove = (event: PointerEvent) => {
      const point = pick(event.clientX, event.clientY);
      if (point === null) return;
      const terrain = editableRef.current;
      const y = terrain === null ? 0 : terrain.sampleHeight(point.x, point.z);
      setCursor({ x: point.x, y, z: point.z });
      if (stroke === null || rampFrom !== null) return;
      const spacing = Math.max(0.25, ui.getState().sculpt.spacing);
      if (last === null || Math.hypot(point.x - last[0], point.z - last[1]) >= spacing) stamp(point);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = pick(event.clientX, event.clientY);
      if (point === null) return;
      const terrain = editableRef.current;
      if (terrain === null) return;
      event.preventDefault();
      setControls(false);
      clickHeight = terrain.sampleHeight(point.x, point.z);
      stroke = beginTerraformStroke(terrain);
      last = null;
      if (ui.getState().sculpt.brush === "ramp") {
        rampFrom = [point.x, point.z];
      } else {
        stamp(point);
      }
    };

    const commit = () => {
      setControls(true);
      const active = stroke;
      stroke = null;
      rampFrom = null;
      last = null;
      if (active === null) return;
      const delta = active.delta();
      if (delta.indices.length === 0) return;
      session.dispatch({ type: "sculptTerrain", delta });
    };

    const onUp = (event: PointerEvent) => {
      if (event.button !== 0 || stroke === null) return;
      if (rampFrom !== null) {
        const point = pick(event.clientX, event.clientY);
        const terrain = editableRef.current;
        if (point !== null && terrain !== null) {
          stroke.stamp({
            ...editFromSettings(ui.getState().sculpt, rampFrom, clickHeight),
            mode: "ramp",
            to: [point.x, point.z],
          });
          refresh();
        }
      }
      commit();
    };

    const onLeave = () => {
      if (stroke !== null) commit();
      setCursor(null);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      if (stroke !== null) commit();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolActive, snapshot, gl, camera, controls, session, ui]);

  if (snapshot === null || editableRef.current === null || boundsRef.current === null) return null;

  return (
    <>
      <SculptMesh
        terrain={editableRef.current}
        bounds={boundsRef.current}
        segments={segments}
        revision={revision}
        meshRef={meshRef}
      />
      {toolActive && cursor !== null ? (
        <TerraformBrushCursor
          center={[cursor.x, cursor.z]}
          y={cursor.y + 0.1}
          radius={uiState.sculpt.radius}
          mode={effectiveBrush(uiState.sculpt.brush, uiState.sculpt.invert)}
        />
      ) : null}
    </>
  );
}
