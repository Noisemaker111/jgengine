import { devtools } from "@jgengine/core/devtools/devtools";
import { getSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
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
import { buildFullReport, buildLeanReport, summarizeLeanReport } from "./devtoolsReports";
import { resetFrameTelemetry } from "./frameSampler";
import { advanceSimulation } from "./simStepper";

/** One RPC call into the agent bridge: a verb name plus its verb-specific fields. */
export type AgentBridgeRequest = { method: string } & Record<string, unknown>;

/** Result of an agent bridge call: `ok: true` with verb payload, or `ok: false` with a reason. */
export type AgentBridgeResponse =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string };

/**
 * @internal
 * The local player's live pose for `player_pose` / `debug_snapshot`, so a drive can measure movement
 * (position deltas between two RPCs) instead of judging it from screenshots. `null` before the game
 * context exists or before the player entity spawns.
 */
export function playerPoseReport(ctx: GameContext | null): { userId: string; position: readonly [number, number, number]; rotationY: number } | null {
  if (ctx === null) return null;
  const entity = ctx.scene.entity.get(ctx.player.userId);
  if (entity === null || entity === undefined) return null;
  const [x, y, z] = entity.position;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { userId: ctx.player.userId, position: [round(x), round(y), round(z)], rotationY: round(entity.rotationY ?? 0) };
}

/**
 * @internal
 * `time_scale` verb: sets the game clock's global timescale (`ctx.time.setTimescale`) so a headless
 * drive can fast-forward timers, economies and day cycles that never finish at capture frame rates.
 * Large scales take large steps — use it for clocks, not to judge movement. Omit `scale` to read.
 */
export function applyTimeScale(ctx: Pick<GameContext, "time">, scale: unknown): AgentBridgeResponse {
  if (scale !== undefined) {
    if (typeof scale !== "number" || !Number.isFinite(scale) || scale < 0 || scale > 120) {
      return { ok: false, error: "time_scale needs { scale } between 0 and 120 (1 = normal)" };
    }
    ctx.time.setTimescale(scale);
  }
  return { ok: true, timescale: ctx.time.timescale(), now: Math.round(ctx.time.now() * 1000) / 1000 };
}

type EditorHost = { gameId: string; handle(request: AgentBridgeRequest): unknown };

/**
 * @internal
 * Resolves true once `isLive()` reports a mounted editor host, polling every `intervalMs` up to
 * `timeoutMs`. `editor_summon` awaits this so the next RPC verb in a `drive` batch finds the editor.
 */
export async function waitForEditorHost(
  isLive: () => boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (let waited = 0; ; waited += intervalMs) {
    if (isLive()) return true;
    if (waited >= timeoutMs) return false;
    await sleep(intervalMs);
  }
}

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
  /** Live game context, once mounted; feeds `player_pose`. */
  getContext?: () => GameContext | null;
}): () => void {
  const { playable, devtoolsEnabled, isDevtoolsOpen, setDevtoolsOpen } = options;
  const getContext = options.getContext ?? (() => null);

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
      case "debug_summary":
      case "debug_snapshot": {
        const ctx = getContext();
        const lean = buildLeanReport(playable);
        if (method === "debug_summary" || request.detail === "summary") {
          const entities = ctx === null ? null : ctx.scene.entity.ids().length;
          return { ok: true, summary: { ...summarizeLeanReport(lean, entities), player: playerPoseReport(ctx) } };
        }
        return { ok: true, snapshot: { ...lean, player: playerPoseReport(ctx) } };
      }
      case "player_pose": {
        const pose = playerPoseReport(getContext());
        return pose === null ? { ok: false, error: "no local player entity yet" } : { ok: true, ...pose };
      }
      case "time_scale": {
        const ctx = getContext();
        if (ctx === null) return { ok: false, error: "no game context yet" };
        return applyTimeScale(ctx, request.scale);
      }
      case "sim_advance": {
        const seconds = request.seconds;
        if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > 120) {
          return { ok: false, error: "sim_advance needs { seconds } in (0, 120]" };
        }
        return advanceSimulation(seconds).then((frames): AgentBridgeResponse => {
          if (frames === null) return { ok: false, error: "no sim driver mounted" };
          const ctx = getContext();
          return { ok: true, frames, now: ctx === null ? null : Math.round(ctx.time.now() * 1000) / 1000 };
        });
      }
      case "notice_push": {
        const ctx = getContext();
        if (ctx === null) return { ok: false, error: "no game context yet" };
        const tone = request.tone;
        if (typeof request.text !== "string" || (tone !== undefined && tone !== "info" && tone !== "success" && tone !== "warn" && tone !== "deny")) {
          return { ok: false, error: "notice_push needs { text, tone?: info|success|warn|deny, ttlMs? }" };
        }
        const ttlMs = typeof request.ttlMs === "number" && request.ttlMs > 0 ? request.ttlMs : undefined;
        const notice = ctx.game.notices.push({ text: request.text, ...(tone === undefined ? {} : { tone }), ...(ttlMs === undefined ? {} : { ttlMs }) });
        return { ok: true, id: notice.id, count: notice.count };
      }
      case "notice_list": {
        const ctx = getContext();
        if (ctx === null) return { ok: false, error: "no game context yet" };
        return { ok: true, notices: ctx.game.notices.list(), rendered: document.querySelectorAll("[data-jg-notice]").length, now: Date.now() };
      }
      case "run_command": {
        const ctx = getContext();
        if (ctx === null) return { ok: false, error: "no game context yet" };
        if (typeof request.name !== "string") return { ok: false, error: "run_command needs { name, input? }" };
        const result = ctx.game.commands.run(request.name, request.input ?? {});
        return result.status === "rejected"
          ? { ok: true, status: result.status, reason: result.reason, ...(result.message === undefined ? {} : { message: result.message }) }
          : { ok: true, status: result.status };
      }
      case "debug_report":
        return { ok: true, report: buildFullReport(playable) };
      case "debug_perf_reset":
        devtools.frame.reset();
        resetFrameTelemetry();
        return { ok: true };
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
        return waitForEditorHost(() => window.__jgengineEditorHost !== undefined).then((live) =>
          live ? { ok: true, live: true } : { ok: false, error: "editor did not mount within 15s" },
        );
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
