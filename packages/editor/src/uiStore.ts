import type { EditorSession, EditorVec3, EditorVolumeShape } from "@jgengine/core/editor/index";
import type { TerraformFalloff, TerraformShape } from "@jgengine/core/world/terraform";

/** Which top-level editor tool is active: object placement/selection, or terrain sculpting. */
export type EditorTool = "select" | "terrain";

/** A heightfield sculpt brush the terrain tool can apply. */
export type TerrainBrushKind = "raise" | "lower" | "smooth" | "flatten" | "noise" | "ramp";

/** The terrain tool's active sub-mode: reshape the heightfield, or paint material layers onto it. */
export type TerrainMode = "sculpt" | "paint";

/** A paintable terrain material layer — a surface id plus the color it renders as. */
export interface TerrainMaterial {
  id: string;
  label: string;
  color: string;
}

/** The default terrain paint palette (surface id → color) shared by the panel and the mesh. */
export const TERRAIN_MATERIALS: readonly TerrainMaterial[] = [
  { id: "grass", label: "Grass", color: "#4b7f3f" },
  { id: "dirt", label: "Dirt", color: "#6b4f34" },
  { id: "rock", label: "Rock", color: "#7c7f86" },
  { id: "sand", label: "Sand", color: "#c2b283" },
  { id: "mud", label: "Mud", color: "#574433" },
  { id: "snow", label: "Snow", color: "#eef3f7" },
  { id: "road", label: "Road", color: "#3a3a3d" },
  { id: "gravel", label: "Gravel", color: "#8d8d84" },
];

/** Maps every default material id to its render color, for the sculpt mesh's per-cell surface tint. */
export const TERRAIN_MATERIAL_COLORS: Record<string, string> = Object.fromEntries(
  TERRAIN_MATERIALS.map((material) => [material.id, material.color]),
);

/** Live terrain material-paint controls driven by the terrain tool panel. */
export interface PaintSettings {
  material: string;
  radius: number;
  shape: TerraformShape;
}

/** The terrain tool's default paint controls. */
export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  material: "grass",
  radius: 12,
  shape: "circle",
};

/** Live terrain-brush controls driven by the terrain tool panel. */
export interface SculptSettings {
  brush: TerrainBrushKind;
  radius: number;
  strength: number;
  falloff: TerraformFalloff;
  shape: TerraformShape;
  /** Stamp spacing (world units) along a drag — smaller = denser strokes. */
  spacing: number;
  /** Flatten target; `null` samples the ground height under the first click. */
  flattenHeight: number | null;
  noiseSeed: number;
  /** Invert modifier — flips raise↔lower for the active brush. */
  invert: boolean;
  heightLimit: { min: number | null; max: number | null };
}

/** The terrain tool's default brush controls. */
export const DEFAULT_SCULPT_SETTINGS: SculptSettings = {
  brush: "raise",
  radius: 12,
  strength: 1,
  falloff: "smooth",
  shape: "circle",
  spacing: 2,
  flattenHeight: null,
  noiseSeed: 1337,
  invert: false,
  heightLimit: { min: null, max: null },
};

/** Which transform gizmo is active for the current selection. */
export type GizmoMode = "translate" | "rotate" | "scale";

/** Gizmo handle orientation: world axes, or the selection's local (yaw-rotated) axes. */
export type GizmoSpace = "world" | "local";

/** How gizmo drags land: stick to terrain height, quantize to a grid, or free. */
export type SnapMode = "ground" | "grid" | "off";

/** Rotation snap increments (degrees) offered by the toolbar snap menu. */
export const ROTATION_SNAP_CHOICES_DEG: readonly number[] = [5, 15, 45, 90];

/** Scale snap increments offered by the toolbar snap menu. */
export const SCALE_SNAP_CHOICES: readonly number[] = [0.1, 0.25, 0.5, 1];

/** The active creation tool — what a viewport click places next. */
export type PlacementTool =
  | { tool: "marker"; kind: string }
  | { tool: "volume"; kind: string; shape: EditorVolumeShape }
  | { tool: "note" }
  | { tool: "path"; kind: string };

/** @internal Open viewport context menu state (#866); null when closed. */
export interface EditorContextMenuState {
  clientX: number;
  clientY: number;
  hitId: string | null;
  ground: EditorVec3 | null;
}

/** Transient editor UI state shared between chrome, viewport, and gizmos. */
export interface EditorUiState {
  gizmoMode: GizmoMode;
  /** Whether gizmo handles align to world axes or the selection's yaw. */
  gizmoSpace: GizmoSpace;
  snapMode: SnapMode;
  gridSize: number;
  /** Rotation snap increment in degrees; `null` rotates freely. */
  rotationSnapDeg: number | null;
  /** Scale snap increment; `null` scales freely. */
  scaleSnap: number | null;
  showGrid: boolean;
  /** Surface-following iso-elevation contour overlay (terrain readability). */
  showContours: boolean;
  /** Terrain-draped reference grid overlay that climbs relief instead of being occluded by it. */
  showSurfaceGrid: boolean;
  /** Measurable elevation HUD: cursor height/delta, region min/max/mean, contour interval. */
  showElevation: boolean;
  placement: PlacementTool | null;
  pathDraft: readonly EditorVec3[];
  pathPoint: { pathId: string; index: number } | null;
  tool: EditorTool;
  terrainMode: TerrainMode;
  sculpt: SculptSettings;
  paint: PaintSettings;
  contextMenu: EditorContextMenuState | null;
}

/** Subscribable store for the editor's transient UI state (gizmo, snapping, placement). */
export interface EditorUiStore {
  getState(): EditorUiState;
  patch(partial: Partial<EditorUiState>): void;
  subscribe(listener: () => void): () => void;
  startPlacement(tool: PlacementTool): void;
  cancelPlacement(): void;
  pushDraftPoint(point: EditorVec3): void;
  commitPathDraft(session: EditorSession): void;
  setTool(tool: EditorTool): void;
  setTerrainMode(mode: TerrainMode): void;
  patchSculpt(partial: Partial<SculptSettings>): void;
  patchPaint(partial: Partial<PaintSettings>): void;
}

function placementId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Creates the shared UI store the editor chrome and viewport both drive. */
export function createEditorUiStore(): EditorUiStore {
  let state: EditorUiState = {
    gizmoMode: "translate",
    gizmoSpace: "world",
    snapMode: "ground",
    gridSize: 1,
    rotationSnapDeg: 15,
    scaleSnap: null,
    showGrid: true,
    showContours: false,
    showSurfaceGrid: false,
    showElevation: false,
    placement: null,
    pathDraft: [],
    pathPoint: null,
    tool: "select",
    terrainMode: "sculpt",
    sculpt: { ...DEFAULT_SCULPT_SETTINGS },
    paint: { ...DEFAULT_PAINT_SETTINGS },
    contextMenu: null,
  };
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  const store: EditorUiStore = {
    getState: () => state,
    patch(partial) {
      state = { ...state, ...partial };
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startPlacement(tool) {
      state = { ...state, placement: tool, pathDraft: [], pathPoint: null };
      emit();
    },
    cancelPlacement() {
      if (state.placement === null && state.pathDraft.length === 0) return;
      state = { ...state, placement: null, pathDraft: [] };
      emit();
    },
    pushDraftPoint(point) {
      state = { ...state, pathDraft: [...state.pathDraft, point] };
      emit();
    },
    commitPathDraft(session) {
      const placement = state.placement;
      if (placement === null || placement.tool !== "path" || state.pathDraft.length < 2) {
        store.cancelPlacement();
        return;
      }
      session.dispatch({
        type: "addPath",
        path: {
          id: placementId(placement.kind),
          kind: placement.kind,
          points: state.pathDraft.map((point) => ({ ...point })),
          width: 4,
        },
      });
      state = { ...state, placement: null, pathDraft: [] };
      emit();
    },
    setTool(tool) {
      if (state.tool === tool) return;
      // Leaving/entering the terrain tool clears any half-finished placement.
      state = { ...state, tool, placement: null, pathDraft: [] };
      emit();
    },
    patchSculpt(partial) {
      state = { ...state, sculpt: { ...state.sculpt, ...partial } };
      emit();
    },
    setTerrainMode(mode) {
      if (state.terrainMode === mode) return;
      state = { ...state, terrainMode: mode };
      emit();
    },
    patchPaint(partial) {
      state = { ...state, paint: { ...state.paint, ...partial } };
      emit();
    },
  };
  return store;
}

/** Generates a fresh scene-object id for a placement tool click. */
export function newPlacementId(prefix: string): string {
  return placementId(prefix);
}
