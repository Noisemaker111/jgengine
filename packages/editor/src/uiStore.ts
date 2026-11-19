import type { EditorSession, EditorVec3, EditorVolumeShape } from "@jgengine/core/editor/index";
import type { TerraformFalloff, TerraformShape } from "@jgengine/core/terrain/terraform";

import type { ClipPreviewSession } from "./shell/clipPreview";

export type EditorTool = "select" | "terrain";

export type TerrainBrushKind = "raise" | "lower" | "smooth" | "flatten" | "noise" | "ramp";

export type TerrainMode = "sculpt" | "paint";

export interface PaintSettings {
  material: string;
  radius: number;
  shape: TerraformShape;
}

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  material: "grass",
  radius: 12,
  shape: "circle",
};

export interface SculptSettings {
  brush: TerrainBrushKind;
  radius: number;
  strength: number;
  falloff: TerraformFalloff;
  shape: TerraformShape;
  spacing: number;
  flattenHeight: number | null;
  noiseSeed: number;
  invert: boolean;
  heightLimit: { min: number | null; max: number | null };
}

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

export type GizmoMode = "translate" | "rotate" | "scale";

export type GizmoSpace = "world" | "local";

export type GizmoPivot = "origin" | "center" | "median";

export type EditorSnapMode = "ground" | "grid" | "off";

export type CameraProjectionMode = "perspective" | "orthographic";

/** Rotation snap increments (degrees) offered by the toolbar snap menu. */
export const ROTATION_SNAP_CHOICES_DEG: readonly number[] = [5, 15, 45, 90];

export const SCALE_SNAP_CHOICES: readonly number[] = [0.1, 0.25, 0.5, 1];

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

export interface EditorUiState {
  gizmoMode: GizmoMode;
  gizmoSpace: GizmoSpace;
  gizmoPivot: GizmoPivot;
  snapMode: EditorSnapMode;
  gridSize: number;
  /** Rotation snap increment in degrees; `null` rotates freely. */
  rotationSnapDeg: number | null;
  scaleSnap: number | null;
  cameraProjection: CameraProjectionMode;
  showGrid: boolean;
  showContours: boolean;
  /** Terrain-draped reference grid overlay that climbs relief instead of being occluded by it. */
  showSurfaceGrid: boolean;
  showElevation: boolean;
  placement: PlacementTool | null;
  pathDraft: readonly EditorVec3[];
  pathPoint: { pathId: string; index: number } | null;
  /** Viewport pre-selection hover (object under cursor); null when nothing is hovered. */
  hoverId: string | null;
  tool: EditorTool;
  terrainMode: TerrainMode;
  sculpt: SculptSettings;
  paint: PaintSettings;
  contextMenu: EditorContextMenuState | null;
  /**
   * Active viewport clip-preview session (rigged asset + playback driver), or null when nothing is
   * previewing. Driven by the Animation dock's clip mode; rendered by `ClipPreviewLayer`.
   */
  clipPreview: ClipPreviewSession | null;
}

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

export function createEditorUiStore(): EditorUiStore {
  let state: EditorUiState = {
    gizmoMode: "translate",
    gizmoSpace: "world",
    gizmoPivot: "center",
    snapMode: "ground",
    gridSize: 1,
    rotationSnapDeg: 15,
    scaleSnap: null,
    cameraProjection: "perspective",
    showGrid: true,
    showContours: false,
    showSurfaceGrid: false,
    showElevation: false,
    placement: null,
    pathDraft: [],
    pathPoint: null,
    hoverId: null,
    tool: "select",
    terrainMode: "sculpt",
    sculpt: { ...DEFAULT_SCULPT_SETTINGS },
    paint: { ...DEFAULT_PAINT_SETTINGS },
    contextMenu: null,
    clipPreview: null,
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

export function newPlacementId(prefix: string): string {
  return placementId(prefix);
}
