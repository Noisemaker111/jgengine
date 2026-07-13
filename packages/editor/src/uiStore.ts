import type { EditorSession, EditorVec3, EditorVolumeShape } from "@jgengine/core/editor/index";

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
  };
  return store;
}

/** Generates a fresh scene-object id for a placement tool click. */
export function newPlacementId(prefix: string): string {
  return placementId(prefix);
}
