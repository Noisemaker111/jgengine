import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import type { PlayableGame } from "../registry";
import {
  isHudAnchor,
  listActiveHudLayouts,
  type HudPlacement,
} from "@jgengine/core/ui/hudLayout";
import {
  listHudPanelTypes,
  resolvePanelResize,
  resizePanelSize,
  type EditorUiPanelLayout,
} from "@jgengine/core/ui/hudDocument";
import { buildFullReport, buildLeanReport } from "./DevtoolsOverlay";

/** One RPC call into the agent bridge: a verb name plus its verb-specific fields. */
export type AgentBridgeRequest = { method: string } & Record<string, unknown>;

/** Result of an agent bridge call: `ok: true` with verb payload, or `ok: false` with a reason. */
export type AgentBridgeResponse =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string };

type EditorHost = { gameId: string; handle(request: AgentBridgeRequest): unknown };

async function saveScene(editorHost: EditorHost): Promise<AgentBridgeResponse> {
  const endpoint = getSaveEndpoint();
  if (endpoint === null) return { ok: false, error: "no save endpoint — save_scene only works in the dev runner" };
  const exported = editorHost.handle({ method: "export_document" }) as {
    ok?: boolean;
    result?: { json?: string };
  };
  const json = exported?.result?.json;
  if (exported?.ok !== true || typeof json !== "string") {
    return { ok: false, error: "export_document failed" };
  }
  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "editor-document", gameId: editorHost.gameId, json }),
    });
    const saved = (await response.json()) as { ok: boolean; path?: string; error?: string };
    return saved.ok ? { ok: true, path: saved.path } : { ok: false, error: saved.error ?? "save failed" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

declare global {
  interface Window {
    __jgengineAgent?: { handle(request: AgentBridgeRequest): unknown };
    __jgengineEditorHost?: EditorHost;
    __jgengineSummonEditor?: () => void;
  }
}

function canvasPanels() {
  return listActiveHudLayouts().map((layout, index) => {
    const state = layout.getState();
    return {
      layout: index,
      editing: state.editing,
      locked: state.locked,
      panels: Object.values(state.panels).map((panel) => ({
        id: panel.id,
        anchor: panel.placement.anchor,
        dx: panel.placement.dx,
        dy: panel.placement.dy,
        width: panel.width,
        height: panel.height,
        visible: panel.visible,
        type: panel.type,
        moved: panel.moved,
      })),
    };
  });
}

function writeUiPanelDocument(id: string, panel: EditorUiPanelLayout): boolean {
  const host = window.__jgengineEditorHost;
  if (host === undefined) return false;
  host.handle({
    method: "dispatch",
    command: { type: "setUiPanel", id, patch: panel },
  });
  return true;
}

function panelLayoutSnapshot(
  placement: HudPlacement,
  extras?: { width?: number; height?: number; visible?: boolean; type?: string },
): EditorUiPanelLayout {
  return {
    anchor: placement.anchor,
    dx: placement.dx,
    dy: placement.dy,
    ...(extras?.width === undefined ? {} : { width: extras.width }),
    ...(extras?.height === undefined ? {} : { height: extras.height }),
    ...(extras?.visible === undefined ? {} : { visible: extras.visible }),
    ...(extras?.type === undefined ? {} : { type: extras.type }),
  };
}

/**
 * @internal
 * Headless control plane spanning the F2 chord family: debug mode (F2+D),
 * canvas mode (F2+C), and editor mode (F2+E). Installed on every
 * GamePlayerShell mount as `window.__jgengineAgent`; unknown verbs delegate
 * to the editor host when one is live, so a single RPC surface covers all
 * three modes for `bun run drive --rpc`.
 */
export function installAgentBridge(options: {
  playable: PlayableGame;
  devtoolsEnabled: boolean;
  isDevtoolsOpen: () => boolean;
  setDevtoolsOpen: (open: boolean) => void;
}): () => void {
  const { playable, devtoolsEnabled, isDevtoolsOpen, setDevtoolsOpen } = options;

  const handle = (request: AgentBridgeRequest): AgentBridgeResponse | Promise<AgentBridgeResponse> => {
    const method = typeof request?.method === "string" ? request.method : "";
    switch (method) {
      case "agent_status":
        return {
          ok: true,
          game: playable.game.name,
          modes: {
            debug: { available: devtoolsEnabled, open: isDevtoolsOpen(), chord: "F2+D" },
            canvas: { available: listActiveHudLayouts().length > 0, chord: "F2+C" },
            editor: {
              available: window.__jgengineEditorHost !== undefined || window.__jgengineSummonEditor !== undefined,
              live: window.__jgengineEditorHost !== undefined,
              chord: "F2+E",
            },
          },
        };
      case "debug_open": {
        if (!devtoolsEnabled) return { ok: false, error: "devtools disabled for this game" };
        const open = typeof request.open === "boolean" ? request.open : !isDevtoolsOpen();
        setDevtoolsOpen(open);
        return { ok: true, open };
      }
      case "debug_snapshot":
        return { ok: true, snapshot: buildLeanReport(playable) };
      case "debug_report":
        return { ok: true, report: buildFullReport(playable) };
      case "canvas_state":
        return { ok: true, layouts: canvasPanels() };
      case "canvas_set_editing": {
        const editing = request.editing === true;
        const layouts = listActiveHudLayouts();
        if (layouts.length === 0) return { ok: false, error: "no HudCanvas mounted" };
        for (const layout of layouts) layout.setEditing(editing);
        return { ok: true, editing };
      }
      case "canvas_move_panel": {
        const id = typeof request.id === "string" ? request.id : "";
        const anchor = request.anchor;
        const dx = typeof request.dx === "number" ? request.dx : 0;
        const dy = typeof request.dy === "number" ? request.dy : 0;
        if (id === "" || !isHudAnchor(anchor)) {
          return { ok: false, error: "canvas_move_panel needs { id, anchor } (dx/dy optional px offsets)" };
        }
        const placement: HudPlacement = { anchor, dx, dy };
        for (const layout of listActiveHudLayouts()) {
          const existing = layout.getState().panels[id];
          if (existing === undefined) continue;
          layout.hydrate(
            JSON.stringify({
              v: 2,
              panels: {
                [id]: {
                  ...placement,
                  ...(existing.width === undefined ? {} : { width: existing.width }),
                  ...(existing.height === undefined ? {} : { height: existing.height }),
                  ...(existing.visible === false ? { visible: false } : {}),
                  ...(existing.type === undefined ? {} : { type: existing.type }),
                },
              },
            }),
          );
          const panel = layout.getState().panels[id]!;
          const uiPanel = panelLayoutSnapshot(panel.placement, {
            width: panel.width,
            height: panel.height,
            visible: panel.visible,
            type: panel.type,
          });
          const document = writeUiPanelDocument(id, uiPanel);
          return { ok: true, id, placement: panel.placement, panel: uiPanel, document };
        }
        return { ok: false, error: `no HUD panel "${id}" — canvas_state lists ids` };
      }
      case "canvas_resize_panel": {
        const id = typeof request.id === "string" ? request.id : "";
        if (id === "") {
          return { ok: false, error: "canvas_resize_panel needs { id, width?/height? or dw?/dh? }" };
        }
        for (const layout of listActiveHudLayouts()) {
          const existing = layout.getState().panels[id];
          if (existing === undefined) continue;
          const resize = resolvePanelResize(existing.type);
          const current = {
            width: existing.width ?? (typeof request.width === "number" ? request.width : 100),
            height: existing.height ?? (typeof request.height === "number" ? request.height : 40),
          };
          let next = current;
          if (typeof request.width === "number" || typeof request.height === "number") {
            const absolute = {
              width: typeof request.width === "number" ? request.width : current.width,
              height: typeof request.height === "number" ? request.height : current.height,
            };
            next = resizePanelSize(
              current,
              { dw: absolute.width - current.width, dh: absolute.height - current.height },
              "both",
              resize,
            );
          } else {
            const dw = typeof request.dw === "number" ? request.dw : 0;
            const dh = typeof request.dh === "number" ? request.dh : 0;
            next = resizePanelSize(current, { dw, dh }, resize.axes, resize);
          }
          layout.hydrate(
            JSON.stringify({
              v: 2,
              panels: {
                [id]: {
                  anchor: existing.placement.anchor,
                  dx: existing.placement.dx,
                  dy: existing.placement.dy,
                  width: next.width,
                  height: next.height,
                  ...(existing.visible === false ? { visible: false } : {}),
                  ...(existing.type === undefined ? {} : { type: existing.type }),
                },
              },
            }),
          );
          const panel = layout.getState().panels[id]!;
          const uiPanel = panelLayoutSnapshot(panel.placement, {
            width: panel.width,
            height: panel.height,
            visible: panel.visible,
            type: panel.type,
          });
          const document = writeUiPanelDocument(id, uiPanel);
          return { ok: true, id, size: next, panel: uiPanel, document };
        }
        return { ok: false, error: `no HUD panel "${id}" — canvas_state lists ids` };
      }
      case "canvas_list_panel_types":
        return {
          ok: true,
          types: listHudPanelTypes().map((def) => ({
            id: def.id,
            label: def.label,
            resize: def.resize,
            minWidth: def.minWidth,
            maxWidth: def.maxWidth,
            minHeight: def.minHeight,
            maxHeight: def.maxHeight,
            hasSchema: def.schema !== undefined,
          })),
        };
      case "canvas_reset": {
        const id = typeof request.id === "string" ? request.id : undefined;
        const layouts = listActiveHudLayouts();
        if (layouts.length === 0) return { ok: false, error: "no HudCanvas mounted" };
        for (const layout of layouts) layout.reset(id);
        return { ok: true };
      }
      case "editor_summon": {
        if (window.__jgengineEditorHost !== undefined) return { ok: true, live: true };
        if (window.__jgengineSummonEditor === undefined) {
          return { ok: false, error: "no editor summoner on this page — open with ?mode=editor" };
        }
        window.__jgengineSummonEditor();
        return { ok: true, live: false };
      }
      case "save_scene": {
        const editorHost = window.__jgengineEditorHost;
        if (editorHost === undefined) return { ok: false, error: "no live editor — editor_summon or mode=editor first" };
        return saveScene(editorHost);
      }
      default: {
        const editorHost = window.__jgengineEditorHost;
        if (editorHost !== undefined) return editorHost.handle(request) as AgentBridgeResponse;
        return {
          ok: false,
          error: `unknown method "${method}" and no live editor — editor verbs need mode=editor or editor_summon first`,
        };
      }
    }
  };

  window.__jgengineAgent = { handle };
  return () => {
    if (window.__jgengineAgent?.handle === handle) delete window.__jgengineAgent;
  };
}
