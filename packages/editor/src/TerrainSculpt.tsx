import { useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { EditorSession } from "@jgengine/core/editor/index";
import type { TerrainEnvironmentDescriptor, WorldFeature } from "@jgengine/core/world/features";
import type { Aabb } from "@jgengine/core/world/geometry";
import { createTerrainPaletteSampler, type TerrainPalette } from "@jgengine/core/world/terrain";
import {
  beginSurfaceStroke,
  beginTerraformStroke,
  editableTerrainFromSnapshot,
  type EditableTerrain,
  type SurfaceStroke,
  type TerraformEdit,
  type TerraformSnapshot,
  type TerraformStroke,
} from "@jgengine/core/world/terraform";
import { useGameContext } from "@jgengine/react/provider";
import { normalizeHeightBlend, TerraformBrushCursor } from "@jgengine/shell/terrain";

import { editorPerfMarks } from "./perfMarks";
import type { EditorHostApi } from "./session";
import { TERRAIN_MATERIAL_COLORS, type EditorUiStore, type SculptSettings, type TerrainBrushKind } from "./uiStore";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const LOW = new THREE.Color("#3f5d34");
const HIGH = new THREE.Color("#8f9c66");
const COLOR_SPAN = 24;

type PaletteSampler = (x: number, z: number) => TerrainPalette;

/** Resolves a material layer to its render color (its tint, else its palette surface color). */
function layerColor(layer: { surface: string; tint?: string }): string {
  return layer.tint ?? TERRAIN_MATERIAL_COLORS[layer.surface] ?? "#7c7f86";
}

/** The game's `environment({ terrain })` descriptor, when the world it declares carries one — the same descriptor `TerrainGround` samples at runtime via `createTerrainPaletteSampler`. */
function terrainDescriptorOf(world: WorldFeature | undefined): TerrainEnvironmentDescriptor | undefined {
  return world?.kind === "environment" ? world.terrain : undefined;
}

/** The `[min, max]` height band `TerrainGround` blends `low`→`high` across for this descriptor (mirrors `EnvironmentScene.tsx`'s `TerrainGround` heightRange). */
function heightRangeOf(descriptor: TerrainEnvironmentDescriptor): readonly [number, number] {
  const base = descriptor.baseHeight ?? 0;
  const swing = descriptor.height * 1.2;
  return [base - swing, base + swing];
}

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

const PAINT_TINT = new THREE.Color();
const BLEND_A = new THREE.Color();
const BLEND_B = new THREE.Color();

/**
 * The vertex tone under a world point: weighted layer blend, painted surface, or a height gradient.
 * With no painted layer/surface at the point, `paletteAt` (the game's runtime terrain palette
 * sampler, when the world declares one) supplies the low/high colors instead of the flat editor
 * default — so `materialRegions`/base `colors`/`material` (worn paths, rock outcrops, biome tint)
 * show through in the editor the same way `TerrainGround` renders them at runtime.
 */
function toneAt(
  terrain: EditableTerrain,
  x: number,
  z: number,
  height: number,
  out: THREE.Color,
  paletteAt: PaletteSampler | null,
  heightRange: readonly [number, number],
): void {
  const layers = terrain.layers;
  if (layers.length > 0) {
    const weights = terrain.weightsAt(x, z);
    if (weights.length === layers.length) {
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let l = 0; l < layers.length; l += 1) {
        const w = weights[l]! * (layers[l]!.opacity ?? 1);
        if (w <= 0) continue;
        BLEND_B.set(layerColor(layers[l]!));
        r += BLEND_B.r * w;
        g += BLEND_B.g * w;
        b += BLEND_B.b * w;
        total += w;
      }
      if (total > 0) {
        out.setRGB(r / total, g / total, b / total);
        return;
      }
    }
  }
  const surface = terrain.surfaceAt(x, z);
  const painted = surface === null ? undefined : TERRAIN_MATERIAL_COLORS[surface];
  if (painted !== undefined) {
    out.copy(PAINT_TINT.set(painted));
    return;
  }
  if (paletteAt !== null) {
    const palette = paletteAt(x, z);
    const blend = normalizeHeightBlend(height, heightRange[0], heightRange[1]);
    out.copy(BLEND_A.set(palette.low).lerp(BLEND_B.set(palette.high), blend));
    return;
  }
  const t = Math.max(0, Math.min(1, (height + COLOR_SPAN * 0.25) / COLOR_SPAN));
  out.copy(BLEND_A.copy(LOW).lerp(HIGH, t));
}

/**
 * Re-samples vertex Y and vertex color from the live terrain (in place — no reallocation). When a
 * dirty `region` is given, only vertices inside it re-sample — the whole-mesh resample per stamp is
 * the sculpt hot path — while normals recompute across the mesh for seamless shading. Painted/blended
 * layers win the vertex color; unpainted ground falls back to the runtime terrain palette (or the
 * flat height gradient with no descriptor). Records rebuild time.
 */
function displace(
  geometry: THREE.BufferGeometry,
  terrain: EditableTerrain,
  bounds: Aabb,
  region: Aabb | null,
  paletteAt: PaletteSampler | null,
  heightRange: readonly [number, number],
): void {
  const started = performance.now();
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  let colors = geometry.attributes.color as THREE.BufferAttribute | undefined;
  const full = region === null || colors === undefined || colors.count !== position.count;
  if (colors === undefined || colors.count !== position.count) {
    colors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
    geometry.setAttribute("color", colors);
  }
  const tone = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + cx;
    const z = position.getZ(index) + cz;
    if (!full && (x < region!.minX || x > region!.maxX || z < region!.minZ || z > region!.maxZ)) continue;
    const height = terrain.sampleHeight(x, z);
    position.setY(index, height);
    toneAt(terrain, x, z, height, tone, paletteAt, heightRange);
    colors.setXYZ(index, tone.r, tone.g, tone.b);
  }
  position.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  editorPerfMarks.record("rebuild", performance.now() - started);
}

function SculptMesh({
  terrain,
  bounds,
  segments,
  revision,
  regionRef,
  meshRef,
  paletteAt,
  heightRange,
}: {
  terrain: EditableTerrain;
  bounds: Aabb;
  segments: number;
  revision: number;
  regionRef: React.MutableRefObject<Aabb | null>;
  meshRef: React.MutableRefObject<THREE.Mesh | null>;
  paletteAt: PaletteSampler | null;
  heightRange: readonly [number, number];
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
    displace(geometry, terrain, bounds, regionRef.current, paletteAt, heightRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, terrain, revision, paletteAt, heightRange]);

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
 * @internal — mounted by `EditorApp`; not a game-author entry point.
 */
export const TerrainSculpt = memo(function TerrainSculpt({
  api,
  ui,
  world,
}: {
  api: EditorHostApi;
  ui: EditorUiStore;
  world?: WorldFeature;
}) {
  const ctx = useGameContext();
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;
  const session: EditorSession = api.getSession();

  const terrainDescriptor = useMemo(() => terrainDescriptorOf(world), [world]);
  const paletteAt = useMemo<PaletteSampler | null>(
    () => (terrainDescriptor === undefined ? null : createTerrainPaletteSampler(terrainDescriptor)),
    [terrainDescriptor],
  );
  const heightRange = useMemo<readonly [number, number]>(
    () => (terrainDescriptor === undefined ? [0, 1] : heightRangeOf(terrainDescriptor)),
    [terrainDescriptor],
  );

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
  const regionRef = useRef<Aabb | null>(null);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; z: number } | null>(null);

  const segments = snapshot === null ? 0 : segmentsFor(snapshot);
  const gridKey =
    snapshot === null ? null : `${boundsKey(snapshot.bounds, segments)}:${snapshot.cellSize}`;
  // region === null forces a whole-mesh rebuild; a stamp passes only its dirty footprint.
  const refresh = (region: Aabb | null = null) => {
    regionRef.current = region;
    setRevision((value) => value + 1);
  };

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
    type ActiveStroke =
      | { kind: "sculpt"; stroke: TerraformStroke }
      | { kind: "paint"; stroke: SurfaceStroke };
    let active: ActiveStroke | null = null;
    let rampFrom: [number, number] | null = null;
    let clickHeight = 0;
    let last: [number, number] | null = null;

    const pick = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const started = performance.now();
      const mesh = meshRef.current;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      let result: { x: number; z: number } | null = null;
      if (mesh !== null) {
        const hit = raycaster.intersectObject(mesh, false)[0];
        if (hit !== undefined) result = { x: hit.point.x, z: hit.point.z };
      }
      if (result === null && raycaster.ray.intersectPlane(GROUND_PLANE, planeHit) !== null) {
        result = { x: planeHit.x, z: planeHit.z };
      }
      editorPerfMarks.record("raycast", performance.now() - started);
      return result;
    };

    // The dirty footprint of a stamp — its brush disc plus a two-cell margin for seamless normals.
    const stampRegion = (point: { x: number; z: number }): Aabb => {
      const state = ui.getState();
      const radius = state.terrainMode === "paint" ? state.paint.radius : state.sculpt.radius;
      const margin = radius + (snapshot?.cellSize ?? 1) * 2;
      return { minX: point.x - margin, maxX: point.x + margin, minZ: point.z - margin, maxZ: point.z + margin };
    };

    const setControls = (enabled: boolean) => {
      if (controls !== null && "enabled" in controls) controls.enabled = enabled;
    };

    const stampSpacing = (): number => {
      const state = ui.getState();
      return state.terrainMode === "paint"
        ? Math.max(0.5, state.paint.radius * 0.4)
        : Math.max(0.25, state.sculpt.spacing);
    };

    const stamp = (point: { x: number; z: number }) => {
      if (active === null) return;
      if (active.kind === "sculpt") {
        active.stroke.stamp(editFromSettings(ui.getState().sculpt, [point.x, point.z], clickHeight));
      } else {
        const paint = ui.getState().paint;
        active.stroke.stamp({
          mode: "paint",
          center: [point.x, point.z],
          radius: paint.radius,
          surface: paint.material,
          shape: paint.shape,
        });
      }
      last = [point.x, point.z];
      refresh(stampRegion(point));
    };

    const onMove = (event: PointerEvent) => {
      const point = pick(event.clientX, event.clientY);
      if (point === null) return;
      const terrain = editableRef.current;
      const y = terrain === null ? 0 : terrain.sampleHeight(point.x, point.z);
      setCursor({ x: point.x, y, z: point.z });
      if (active === null || rampFrom !== null) return;
      if (last === null || Math.hypot(point.x - last[0], point.z - last[1]) >= stampSpacing()) stamp(point);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const point = pick(event.clientX, event.clientY);
      if (point === null) return;
      const terrain = editableRef.current;
      if (terrain === null) return;
      event.preventDefault();
      const mode = ui.getState().terrainMode;
      // Alt-click in paint mode is the eyedropper — sample the material under the cursor.
      if (mode === "paint" && event.altKey) {
        const sampled = terrain.surfaceAt(point.x, point.z);
        if (sampled !== null) ui.patchPaint({ material: sampled });
        return;
      }
      setControls(false);
      clickHeight = terrain.sampleHeight(point.x, point.z);
      last = null;
      if (mode === "paint") {
        active = { kind: "paint", stroke: beginSurfaceStroke(terrain) };
        stamp(point);
      } else if (ui.getState().sculpt.brush === "ramp") {
        active = { kind: "sculpt", stroke: beginTerraformStroke(terrain) };
        rampFrom = [point.x, point.z];
      } else {
        active = { kind: "sculpt", stroke: beginTerraformStroke(terrain) };
        stamp(point);
      }
    };

    const commit = () => {
      setControls(true);
      const current = active;
      active = null;
      rampFrom = null;
      last = null;
      if (current === null) return;
      if (current.kind === "sculpt") {
        const delta = current.stroke.delta();
        if (delta.indices.length > 0) session.dispatch({ type: "sculptTerrain", delta });
      } else {
        const delta = current.stroke.delta();
        if (delta.indices.length > 0) session.dispatch({ type: "paintTerrain", delta });
      }
    };

    const onUp = (event: PointerEvent) => {
      if (event.button !== 0 || active === null) return;
      if (rampFrom !== null && active.kind === "sculpt") {
        const point = pick(event.clientX, event.clientY);
        if (point !== null) {
          active.stroke.stamp({
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
      if (active !== null) commit();
      setCursor(null);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      if (active !== null) commit();
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
        regionRef={regionRef}
        meshRef={meshRef}
        paletteAt={paletteAt}
        heightRange={heightRange}
      />
      {toolActive && cursor !== null ? (
        <TerraformBrushCursor
          center={[cursor.x, cursor.z]}
          y={cursor.y + 0.1}
          radius={uiState.terrainMode === "paint" ? uiState.paint.radius : uiState.sculpt.radius}
          mode={uiState.terrainMode === "paint" ? "paint" : effectiveBrush(uiState.sculpt.brush, uiState.sculpt.invert)}
        />
      ) : null}
    </>
  );
});
