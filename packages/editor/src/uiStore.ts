import type { EditorSession, EditorVec3, EditorVolumeShape } from "@jgengine/core/editor/index";
import type { TerraformFalloff, TerraformShape } from "@jgengine/core/world/terraform";

/** Which top-level editor tool is active: object placement/selection, or terrain sculpting. */
export type EditorTool = "select" | "terrain";

/** A heightfield sculpt brush the terrain tool can apply (surface paint is Phase 3). */
export type TerrainBrushKind = "raise" | "lower" | "smooth" | "flatten" | "noise" | "ramp";

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

/** How gizmo drags land: stick to terrain height, quantize to a grid, or free. */
export type SnapMode = "ground" | "grid" | "off";

/** The active creation tool — what a viewport click places next. */
export type PlacementTool =
  | { tool: "marker"; kind: string }
  | { tool: "volume"; kind: string; shape: EditorVolumeShape }
  | { tool: "note" }
  | { tool: "path"; kind: string };

/** Transient editor UI state shared between chrome, viewport, and gizmos. */
export interface EditorUiState {
  gizmoMode: GizmoMode;
  snapMode: SnapMode;
  gridSize: number;
  showGrid: boolean;
  placement: PlacementTool | null;
  pathDraft: readonly EditorVec3[];
  pathPoint: { pathId: string; index: number } | null;
  tool: EditorTool;
  sculpt: SculptSettings;
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
  patchSculpt(partial: Partial<SculptSettings>): void;
}

function placementId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Creates the shared UI store the editor chrome and viewport both drive. */
export function createEditorUiStore(): EditorUiStore {
  let state: EditorUiState = {
    gizmoMode: "translate",
    snapMode: "ground",
    gridSize: 1,
    showGrid: true,
    placement: null,
    pathDraft: [],
    pathPoint: null,
    tool: "select",
    sculpt: { ...DEFAULT_SCULPT_SETTINGS },
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
  };
  return store;
}

/** Generates a fresh scene-object id for a placement tool click. */
export function newPlacementId(prefix: string): string {
  return placementId(prefix);
}
