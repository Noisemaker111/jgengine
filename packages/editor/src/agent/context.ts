import { summarizeEditorSession } from "@jgengine/core/editor/index";

import type { EditorHostApi, EditorRunMode } from "../session";

/** Compact editor state injected into every agent turn so the model sees selection/mode/camera. */
export interface AgentEditorContext {
  gameId: string;
  mode: EditorRunMode;
  selection: string[];
  focus: { x: number; y: number; z: number } | null;
  canUndo: boolean;
  canRedo: boolean;
  summary: {
    markers: number;
    volumes: number;
    paths: number;
    annotations: number;
  };
}

/**
 * Packs the live host's selection, mode, focus, and document counts for agent prompts.
 * Injected into every embedded-panel turn so the agent shares the human's current view.
 */
export function packAgentContext(api: EditorHostApi): AgentEditorContext {
  const session = api.getSession();
  const state = session.getState();
  const summary = summarizeEditorSession(state);
  return {
    gameId: api.gameId,
    mode: api.getMode(),
    selection: [...state.selection],
    focus: api.getFocusTarget(),
    canUndo: session.canUndo(),
    canRedo: session.canRedo(),
    summary: {
      markers: summary.markers,
      volumes: summary.volumes,
      paths: summary.paths,
      annotations: summary.annotations,
    },
  };
}

/** @internal Stable, prompt-friendly serialization of {@link AgentEditorContext}. */
export function formatAgentContext(context: AgentEditorContext): string {
  const focus =
    context.focus === null
      ? "none"
      : `(${context.focus.x.toFixed(1)}, ${context.focus.y.toFixed(1)}, ${context.focus.z.toFixed(1)})`;
  const selection = context.selection.length === 0 ? "(none)" : context.selection.join(", ");
  return [
    `gameId=${context.gameId}`,
    `mode=${context.mode}`,
    `selection=[${selection}]`,
    `focus=${focus}`,
    `counts=markers:${context.summary.markers} volumes:${context.summary.volumes} paths:${context.summary.paths} notes:${context.summary.annotations}`,
    `history=undo:${context.canUndo ? "yes" : "no"} redo:${context.canRedo ? "yes" : "no"}`,
  ].join("\n");
}
