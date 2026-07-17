import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  editorDocumentSize,
  extractEditorFragment,
  listEditorKinds,
  WELL_KNOWN_MARKER_KINDS,
  type EditorDocument,
  type EditorSession,
} from "@jgengine/core/editor/index";
import { VEGETATION_VOLUME_KIND } from "@jgengine/core/world/vegetation";
import { scatterRegionEstimate, SCATTER_PATH_KIND } from "@jgengine/core/world/scatterRegion";
import { listSceneKinds } from "@jgengine/core/scene/sceneKinds";

import { AssetBrowser, type EditorAssetEntry } from "./AssetBrowser";
import { AgentPanel } from "./agent/AgentPanel";
import { CatalogsPanel } from "./CatalogsPanel";
import { CollectionsPanel } from "./CollectionsPanel";
import { EditorContextMenu } from "./EditorContextMenu";
import { OutlinerPanel } from "./OutlinerPanel";
import { PrefabsPanel } from "./PrefabsPanel";
import {
  buildEditorContextMenu,
  type EditorContextAction,
} from "./viewportContextMenu";
import { buildOutlinerGroups } from "./outlinerModel";
import type { EditorHostApi, EditorPerfSample } from "./session";
import { classifyEditorPerf } from "./perfPill";
import { newPlacementId, type EditorUiStore, type PlacementTool, type SnapMode } from "./uiStore";
import { useF2Chord } from "./useF2Chord";
import { BTN, MICRO } from "./chromeStyles";
import { TerrainPanel } from "./TerrainPanel";
import { InspectorPanel } from "./InspectorPanel";

const PERF_POLL_MS = 500;

type WorkspacePanel = "outliner" | "assets" | "collections" | "prefabs" | "catalogs";

const ADD_VOLUME_ENTRIES: readonly { label: string; tool: PlacementTool }[] = [
  { label: "Zone (sphere)", tool: { tool: "volume", kind: "zone", shape: "sphere" } },
  { label: "Zone (box)", tool: { tool: "volume", kind: "zone", shape: "box" } },
  { label: "Zone (cylinder)", tool: { tool: "volume", kind: "zone", shape: "cylinder" } },
  { label: "Aggro range", tool: { tool: "volume", kind: "aggro", shape: "sphere" } },
  { label: "Leash range", tool: { tool: "volume", kind: "leash", shape: "sphere" } },
  { label: "Discover area", tool: { tool: "volume", kind: "discover", shape: "sphere" } },
  { label: "Capture area", tool: { tool: "volume", kind: "capture", shape: "cylinder" } },
  { label: "Vegetation (box)", tool: { tool: "volume", kind: VEGETATION_VOLUME_KIND, shape: "box" } },
  { label: "Vegetation (circle)", tool: { tool: "volume", kind: VEGETATION_VOLUME_KIND, shape: "sphere" } },
];

const SNAP_MODES: readonly { mode: SnapMode; label: string }[] = [
  { mode: "ground", label: "Snap: ground" },
  { mode: "grid", label: "Snap: grid" },
  { mode: "off", label: "Snap: off" },
];

function usePerfSample(api: EditorHostApi): EditorPerfSample | null {
  const [sample, setSample] = useState<EditorPerfSample | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setSample(api.getPerf()), PERF_POLL_MS);
    return () => clearInterval(timer);
  }, [api]);
  return sample;
}

function formatTriangles(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}k`;
  return String(count);
}

const PERF_TONE_CLASS = {
  idle: "text-neutral-500",
  healthy: "text-emerald-400",
  busy: "text-rose-400",
} as const;

/** Toolbar perf pill: neutral "idle" when the loop is throttled/at rest, red only for active low fps. */
function PerfPill({ perf }: { perf: EditorPerfSample }) {
  const tone = classifyEditorPerf(perf);
  const rate = tone === "idle" ? "idle" : `${perf.fps.toFixed(0)} fps`;
  return (
    <span className={`ml-3 ${PERF_TONE_CLASS[tone]}`}>
      {rate} · {perf.drawCalls} draws · {formatTriangles(perf.triangles)} tris
    </span>
  );
}

let clipboardFragment: EditorDocument | null = null;

const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "W / E / R", action: "Move · rotate · scale gizmo" },
  { keys: "T", action: "Toggle terrain sculpt tool" },
  { keys: "F", action: "Frame selection (or whole scene)" },
  { keys: "G", action: "Toggle reference grid" },
  { keys: "N", action: "Cycle instances of selected row" },
  { keys: "Arrows", action: "Nudge selection on X/Z (Shift ×5)" },
  { keys: "PgUp / PgDn", action: "Nudge selection on Y (Shift ×5)" },
  { keys: "Ctrl+A", action: "Select all visible objects" },
  { keys: "Ctrl+C / X / V", action: "Copy · cut · paste selection" },
  { keys: "Ctrl+D", action: "Duplicate selection" },
  { keys: "Ctrl+Z / Y", action: "Undo · redo" },
  { keys: "Ctrl+B", action: "Asset browser" },
  { keys: "Delete", action: "Remove selection" },
  { keys: "Enter / Esc", action: "Finish · cancel path drawing" },
  { keys: "Shift+click", action: "Multi-select · keep placing" },
  { keys: "RMB drag", action: "Orbit camera" },
  { keys: "MMB drag", action: "Pan camera" },
  { keys: "RMB click", action: "Context menu" },
  { keys: "F2+E", action: "Toggle editor ↔ play" },
  { keys: "HUD", action: "Lay out HUD panels (writes ui.panels)" },
  { keys: "F2+D", action: "Engine devtools" },
  { keys: "?", action: "This help" },
];

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type SaveState = "idle" | "saving" | "saved" | "error";

function useDocumentSave(
  session: EditorSession,
  save: ((json: string) => Promise<{ ok: boolean; path?: string; error?: string }>) | undefined,
) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedDocRef = useRef(session.getState().document);
  const dirty = session.getState().document !== savedDocRef.current;
  const doSave = () => {
    if (save === undefined || saveState === "saving") return;
    const document = session.getState().document;
    setSaveState("saving");
    void save(session.exportJson(true)).then((result) => {
      if (result.ok) {
        savedDocRef.current = document;
        setSaveError(null);
        setSaveState("saved");
      } else {
        setSaveError(result.error ?? "save failed");
        setSaveState("error");
      }
    });
  };
  return { available: save !== undefined, dirty, saveState, saveError, doSave };
}

/**
 * The full editor UI shell — toolbar, left panels (outliner/prefabs/sets/layers), viewport overlays,
 * the selector-subscribed {@link InspectorPanel}, the embedded {@link AgentPanel}, and the asset
 * browser — wired to the session, UI store, and host RPC. Mounted by `EditorApp`; not a game-author entry point.
 */
export function EditorChrome({
  gameId,
  session,
  api,
  assets,
  ui,
  baselineDocument,
  save,
}: {
  gameId: string;
  session: EditorSession;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  ui: EditorUiStore;
  /** The document as loaded — drives the header unsaved-dot by reference compare. */
  baselineDocument?: EditorDocument;
  save?: (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
}) {
  const [, setTick] = useState(0);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("outliner");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, tone: "info" | "error" = "info") => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const state = session.getState();
  const visibility = api.getVisibility();
  const perf = usePerfSample(api);
  const uiState = ui.getState();
  const gizmoMode = uiState.gizmoMode;
  const docSave = useDocumentSave(session, save);
  const docSaveRef = useRef(docSave);
  docSaveRef.current = docSave;

  const outlinerGroups = useMemo(() => buildOutlinerGroups(state.document), [state.document]);
  const outlinerGroupsRef = useRef(outlinerGroups);
  outlinerGroupsRef.current = outlinerGroups;

  const sceneStats = useMemo(() => {
    const doc = state.document;
    const objects = doc.markers.length + doc.volumes.length + doc.paths.length + doc.annotations.length;
    let foliage = 0;
    for (const path of doc.paths) if (path.kind === SCATTER_PATH_KIND) foliage += scatterRegionEstimate(path).count;
    return { objects, foliage };
  }, [state.document]);

  const showPanel = (panel: WorkspacePanel) => {
    setActivePanel(panel);
    if (panel === "assets") setBottomOpen(true);
    else setLeftOpen(true);
  };

  useF2Chord("KeyE", () => api.setMode("play"));

  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => ui.subscribe(() => setTick((value) => value + 1)), [ui]);

  const copySelection = useCallback((): number => {
    const current = session.getState();
    if (current.selection.length === 0) return 0;
    const fragment = extractEditorFragment(current.document, current.selection);
    const count = editorDocumentSize(fragment);
    if (count === 0) return 0;
    clipboardFragment = fragment;
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(JSON.stringify(fragment, null, 2)).catch(() => {});
    }
    return count;
  }, [session]);

  const closeContextMenu = useCallback(() => {
    if (ui.getState().contextMenu !== null) ui.patch({ contextMenu: null });
  }, [ui]);

  const runContextAction = useCallback(
    (action: EditorContextAction) => {
      const menu = ui.getState().contextMenu;
      closeContextMenu();
      const current = session.getState();
      const selection = current.selection;
      const ground = menu?.ground ?? null;
      switch (action.id) {
        case "frame": {
          const id = selection[0] ?? menu?.hitId;
          if (id !== undefined && id !== null) api.handle({ method: "camera_goto", id });
          else api.handle({ method: "camera_frame" });
          return;
        }
        case "frameAll":
          api.handle({ method: "camera_frame" });
          return;
        case "duplicate":
          if (selection.length > 0) session.dispatch({ type: "duplicate", ids: selection });
          return;
        case "delete":
          if (selection.length > 0) session.dispatch({ type: "removeMany", ids: selection });
          return;
        case "copy": {
          const count = copySelection();
          if (count > 0) notify(`Copied ${count} object${count === 1 ? "" : "s"}`);
          return;
        }
        case "paste":
          if (clipboardFragment === null) return;
          {
            const count = editorDocumentSize(clipboardFragment);
            session.dispatch({
              type: "addFragment",
              fragment: clipboardFragment,
              offset: { x: 2, y: 0, z: 2 },
            });
            notify(`Pasted ${count} object${count === 1 ? "" : "s"}`);
          }
          return;
        case "createPrefab":
          if (selection.length === 0) return;
          {
            const id = `prefab_${Date.now().toString(36)}`;
            const name = `Prefab ${current.document.prefabs.length + 1}`;
            api.handle({ method: "create_prefab", id, name, ids: [...selection] });
            showPanel("prefabs");
            notify(`Created prefab “${name}”`);
          }
          return;
        case "addMarker":
          if (ground !== null) {
            session.dispatch({
              type: "addMarker",
              marker: {
                id: newPlacementId("player_spawn"),
                kind: "player_spawn",
                position: ground,
                label: "player_spawn",
              },
            });
          } else {
            ui.startPlacement({ tool: "marker", kind: "player_spawn" });
          }
          return;
        case "addVolume":
          if (ground !== null) {
            session.dispatch({
              type: "addVolume",
              volume: {
                id: newPlacementId("zone"),
                kind: "zone",
                shape: "sphere",
                center: ground,
                radius: 10,
                label: "zone",
              },
            });
          } else {
            ui.startPlacement({ tool: "volume", kind: "zone", shape: "sphere" });
          }
          return;
        case "addPath":
          ui.startPlacement({ tool: "path", kind: "route" });
          if (ground !== null) ui.pushDraftPoint(ground);
          return;
        case "addNote":
          if (ground !== null) {
            session.dispatch({
              type: "addNote",
              note: { id: newPlacementId("note"), text: "New note", position: ground },
            });
          } else {
            ui.startPlacement({ tool: "note" });
          }
          return;
        case "openAssets":
          showPanel("assets");
          return;
      }
    },
    [api, closeContextMenu, copySelection, notify, session, ui],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        docSaveRef.current.doSave();
        return;
      }
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping) {
        if (event.key === "Escape" && target instanceof HTMLElement) target.blur();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        session.dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        session.dispatch({ type: "redo" });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        showPanel("assets");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const state = session.getState();
        const visibility = api.getVisibility();
        const ids = [
          ...state.document.markers.filter((m) => visibility[m.kind] !== false).map((m) => m.id),
          ...state.document.volumes.filter((v) => visibility[v.kind] !== false).map((v) => v.id),
          ...state.document.paths.filter((p) => visibility[p.kind] !== false).map((p) => p.id),
          ...(visibility["note"] !== false ? state.document.annotations.map((n) => n.id) : []),
        ];
        if (ids.length > 0) session.dispatch({ type: "select", ids });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        const count = copySelection();
        if (count > 0) {
          event.preventDefault();
          notify(`Copied ${count} object${count === 1 ? "" : "s"}`);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        const count = copySelection();
        if (count > 0) {
          event.preventDefault();
          session.dispatch({ type: "removeMany", ids: session.getState().selection });
          notify(`Cut ${count} object${count === 1 ? "" : "s"}`);
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (clipboardFragment === null) return;
        event.preventDefault();
        const count = editorDocumentSize(clipboardFragment);
        session.dispatch({ type: "addFragment", fragment: clipboardFragment, offset: { x: 2, y: 0, z: 2 } });
        notify(`Pasted ${count} object${count === 1 ? "" : "s"}`);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selection = session.getState().selection;
        if (selection.length > 0) session.dispatch({ type: "duplicate", ids: selection });
        return;
      }
      if (event.key === "Escape") {
        setHelpOpen(false);
        const current = ui.getState();
        if (current.contextMenu !== null) {
          ui.patch({ contextMenu: null });
          return;
        }
        if (current.placement !== null || current.pathDraft.length > 0) {
          ui.cancelPlacement();
          return;
        }
        if (current.pathPoint !== null) {
          ui.patch({ pathPoint: null });
          return;
        }
        if (session.getState().selection.length > 0) session.dispatch({ type: "clearSelection" });
        return;
      }
      if (event.key === "Enter" && ui.getState().placement?.tool === "path") {
        event.preventDefault();
        ui.commitPathDraft(session);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selection = session.getState().selection;
        if (selection.length > 0) session.dispatch({ type: "removeMany", ids: selection });
        return;
      }
      if (event.key === "?" || event.key === "F1") {
        event.preventDefault();
        setHelpOpen((value) => !value);
        return;
      }
      if (event.key === "f" || event.key === "F") {
        const selected = session.getState().selection[0];
        if (selected !== undefined) api.handle({ method: "camera_goto", id: selected });
        else api.handle({ method: "camera_frame" });
        return;
      }
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "PageUp" ||
        event.key === "PageDown"
      ) {
        const selection = session.getState().selection;
        if (selection.length === 0) return;
        event.preventDefault();
        const step = Math.max(0.5, ui.getState().gridSize) * (event.shiftKey ? 5 : 1);
        const delta =
          event.key === "ArrowUp"
            ? { x: 0, y: 0, z: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: 0, z: step }
              : event.key === "ArrowLeft"
                ? { x: -step, y: 0, z: 0 }
                : event.key === "ArrowRight"
                  ? { x: step, y: 0, z: 0 }
                  : event.key === "PageUp"
                    ? { x: 0, y: step, z: 0 }
                    : { x: 0, y: -step, z: 0 };
        session.dispatch({ type: "translate", ids: selection, delta }, { coalesce: `nudge:${selection.join(",")}` });
        return;
      }
      if (event.key === "w" || event.key === "W") ui.patch({ gizmoMode: "translate" });
      if (event.key === "e" || event.key === "E") ui.patch({ gizmoMode: "rotate" });
      if (event.key === "r" || event.key === "R") ui.patch({ gizmoMode: "scale" });
      if (event.key === "g" || event.key === "G") ui.patch({ showGrid: !ui.getState().showGrid });
      if (event.key === "t" || event.key === "T") ui.setTool(ui.getState().tool === "terrain" ? "select" : "terrain");
      if (event.key === "n" || event.key === "N") {
        const selected = session.getState().selection[0];
        if (selected === undefined) return;
        const row = outlinerGroupsRef.current
          .flatMap((group) => group.rows)
          .find((candidate) => candidate.ids.includes(selected));
        if (row === undefined || row.ids.length < 2) return;
        const next = row.ids[(row.ids.indexOf(selected) + 1) % row.ids.length]!;
        session.dispatch({ type: "select", ids: [next] });
        api.handle({ method: "camera_goto", id: next });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, ui, api, notify, copySelection]);

  const kinds = useMemo(() => listEditorKinds(state.document), [state.document]);

  const allKinds = useMemo(
    () =>
      [
        ...new Set([
          ...kinds.markers,
          ...kinds.volumes,
          ...kinds.paths,
          ...(state.document.annotations.length > 0 ? ["note"] : []),
        ]),
      ].sort(),
    [kinds, state.document.annotations.length],
  );

  const studioKinds = useMemo(() => listSceneKinds().filter((definition) => definition.addCategory !== undefined), []);

  const placeAsset = (entry: EditorAssetEntry) => {
    const focus = api.getFocusTarget();
    const focused = session.getState();
    const focusedId = focused.selection[0];
    const selected =
      focused.document.markers.find((marker) => marker.id === focusedId)?.position ??
      focused.document.volumes.find((volume) => volume.id === focusedId)?.center;
    const position = focus ?? selected ?? { x: 0, y: 0, z: 0 };
    api.handle({
      method: "place_asset",
      id: entry.id,
      kind: entry.kind === "model" ? "prop" : entry.kind,
      x: position.x,
      y: position.y,
      z: position.z,
    });
  };

  const importFile = (file: File) => {
    void file.text().then((text) => {
      try {
        session.dispatch({ type: "importJson", json: text });
        const doc = session.getState().document;
        notify(`Imported ${editorDocumentSize(doc)} objects from ${file.name}`);
      } catch (error) {
        notify(`Import failed: ${error instanceof Error ? error.message : "invalid JSON"}`, "error");
      }
    });
  };

  const copyExportJson = () => {
    const json = session.exportJson(true);
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      navigator.clipboard.writeText(json).then(
        () => notify("Document JSON copied to clipboard"),
        () => notify("Clipboard unavailable — use Export instead", "error"),
      );
    } else {
      notify("Clipboard unavailable — use Export instead", "error");
    }
  };

  // Reference compare, not a serialize: stringifying the whole document per edit dispatch burned
  // milliseconds on every nudge/stroke. Same tradeoff as `useDocumentSave.dirty` — undoing back to
  // the pristine state may leave the dot on (history restores clones), which is the cheap side of
  // wrong for an unsaved-edits hint.
  const dirty = baselineDocument !== undefined && state.document !== baselineDocument;

  const startPlacement = (tool: PlacementTool) => {
    setAddOpen(false);
    ui.startPlacement(tool);
  };

  const placement = uiState.placement;
  const placementHint =
    placement === null
      ? null
      : placement.tool === "path"
        ? `Drawing ${placement.kind}: click to add points (${uiState.pathDraft.length}) · Enter finish · Esc cancel`
        : `Placing ${placement.tool === "note" ? "note" : placement.kind}: click the world · Shift-click places more · Esc cancel`;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col text-xs text-neutral-100">
      <header className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 border-b border-white/[0.08] bg-gradient-to-b from-[#15171c]/95 to-[#0d0f13]/95 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
        <button type="button" className="rounded-md bg-gradient-to-br from-cyan-400/15 to-indigo-500/15 px-2 py-1 font-bold tracking-widest text-cyan-300 ring-1 ring-inset ring-cyan-400/25 transition-colors hover:from-cyan-400/25 hover:to-indigo-500/25" onClick={() => setLeftOpen((value) => !value)} aria-label="Toggle hierarchy panel">JG</button>
        <span className="hidden text-neutral-500 sm:inline">
          {gameId}
          {dirty ? <span className="ml-1 text-amber-400" title="Unsaved edits — Export to save">●</span> : null}
        </span>
        <div className="mx-1 h-5 w-px bg-white/[0.07]" />
        <div className="flex items-center gap-0.5 rounded-lg bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
          {(["select", "terrain"] as const).map((tool) => (
            <button key={tool} type="button" className={`rounded-md px-2.5 py-1 capitalize transition-colors ${uiState.tool === tool ? "bg-amber-500/90 text-white shadow-sm shadow-amber-950/50" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => ui.setTool(tool)}>{tool}</button>
          ))}
        </div>
        <div className="h-5 w-px bg-white/[0.07]" />
        <div className={`flex items-center gap-0.5 rounded-lg bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06] ${uiState.tool === "terrain" ? "opacity-40" : ""}`}>
          {(["translate", "rotate", "scale"] as const).map((mode) => (
            <button key={mode} type="button" className={`rounded-md px-2.5 py-1 capitalize transition-colors ${gizmoMode === mode ? "bg-cyan-500/90 text-white shadow-sm shadow-cyan-950/50" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => ui.patch({ gizmoMode: mode })}>
              {mode} <kbd className={`ml-0.5 font-sans text-[9px] ${gizmoMode === mode ? "text-cyan-100/80" : "text-neutral-500"}`}>{mode === "translate" ? "W" : mode === "rotate" ? "E" : "R"}</kbd>
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-white/[0.07]" />
        <div className="relative">
          <button type="button" className={`rounded-md px-2.5 py-1 transition-colors ${addOpen || placement !== null ? "bg-cyan-500/90 text-white shadow-sm shadow-cyan-950/50" : "bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] hover:bg-white/10"}`} onClick={() => setAddOpen((value) => !value)}>+ Add</button>
          {addOpen ? (
            <div className="absolute left-0 top-9 z-50 max-h-[60vh] w-56 overflow-auto rounded-xl border border-white/10 bg-[#111318]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
              <div className={`px-2 pb-1 pt-2 ${MICRO}`}>Markers</div>
              {WELL_KNOWN_MARKER_KINDS.map((kind) => (
                <button key={kind} type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "marker", kind })}>{kind}</button>
              ))}
              <div className={`px-2 pb-1 pt-2 ${MICRO}`}>Volumes</div>
              {ADD_VOLUME_ENTRIES.map((entry) => (
                <button key={entry.label} type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement(entry.tool)}>{entry.label}</button>
              ))}
              <div className={`px-2 pb-1 pt-2 ${MICRO}`}>Studios</div>
              {studioKinds.map((definition) => (
                <button
                  key={definition.kind}
                  type="button"
                  className="block w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-emerald-500/15 hover:text-emerald-100"
                  style={{ color: definition.accent ?? "#34d399" }}
                  onClick={() =>
                    startPlacement(
                      definition.target === "path"
                        ? { tool: "path", kind: definition.kind }
                        : definition.target === "volume"
                          ? { tool: "volume", kind: definition.kind, shape: "box" }
                          : { tool: "marker", kind: definition.kind },
                    )
                  }
                >
                  {definition.label}
                  {definition.target === "path" ? (definition.pathShape === "line" ? " (draw line)" : " (lasso)") : ""}
                </button>
              ))}
              <div className={`px-2 pb-1 pt-2 ${MICRO}`}>Other</div>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "path", kind: "route" })}>Draw path (route)</button>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "path", kind: "road" })}>Draw road</button>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "note" })}>Note</button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            const at = SNAP_MODES.findIndex((entry) => entry.mode === uiState.snapMode);
            ui.patch({ snapMode: SNAP_MODES[(at + 1) % SNAP_MODES.length]!.mode });
          }}
        >
          {SNAP_MODES.find((entry) => entry.mode === uiState.snapMode)?.label}
          {uiState.snapMode === "grid" ? ` ${uiState.gridSize}` : ""}
        </button>
        {uiState.snapMode === "grid" ? (
          <button type="button" className={BTN} onClick={() => ui.patch({ gridSize: uiState.gridSize >= 8 ? 0.5 : uiState.gridSize * 2 })}>±</button>
        ) : null}
        <button type="button" className={`rounded-md px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15 ${uiState.showGrid ? "bg-white/10 text-neutral-200" : "bg-white/[0.03] text-neutral-500"}`} onClick={() => ui.patch({ showGrid: !uiState.showGrid })}>Grid G</button>
        <button type="button" title="Surface-following iso-elevation contours" className={`rounded-md px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15 ${uiState.showContours ? "bg-white/10 text-neutral-200" : "bg-white/[0.03] text-neutral-500"}`} onClick={() => ui.patch({ showContours: !uiState.showContours })}>Contours</button>
        <button type="button" title="Terrain-draped reference grid" className={`rounded-md px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15 ${uiState.showSurfaceGrid ? "bg-white/10 text-neutral-200" : "bg-white/[0.03] text-neutral-500"}`} onClick={() => ui.patch({ showSurfaceGrid: !uiState.showSurfaceGrid })}>Drape</button>
        <button type="button" title="Measurable elevation readout" className={`rounded-md px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15 ${uiState.showElevation ? "bg-white/10 text-neutral-200" : "bg-white/[0.03] text-neutral-500"}`} onClick={() => ui.patch({ showElevation: !uiState.showElevation })}>Elev</button>
        <div className="h-5 w-px bg-white/[0.07]" />
        <button type="button" className={BTN} onClick={() => api.handle({ method: "camera_frame" })}>Frame all</button>
        <button type="button" className={`${BTN} disabled:opacity-40`} onClick={() => session.dispatch({ type: "undo" })} disabled={!session.canUndo()}>Undo</button>
        <button type="button" className={`${BTN} disabled:opacity-40`} onClick={() => session.dispatch({ type: "redo" })} disabled={!session.canRedo()}>Redo</button>
        <button type="button" className={BTN} onClick={() => showPanel("assets")}>Assets</button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={BTN} onClick={() => setRightOpen((value) => !value)}>Inspector</button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 ring-1 ring-inset transition-colors ${
              agentOpen
                ? "bg-violet-500/25 text-violet-100 ring-violet-400/40"
                : "bg-white/[0.04] text-neutral-300 ring-white/[0.06] hover:bg-white/10 hover:text-neutral-100"
            }`}
            onClick={() => setAgentOpen((value) => !value)}
            title="Embedded agent panel — same RPC/undo as the GUI"
          >
            Agent
          </button>
          <button type="button" className={BTN} title="Lay out HUD panels over the live game and save placement to the scene" onClick={() => api.setMode("hud")}>HUD</button>
          <button type="button" className={BTN} onClick={() => api.setMode("walk")}>Walk</button>
          <button type="button" className="rounded-md bg-gradient-to-b from-emerald-500 to-emerald-600 px-3 py-1 font-semibold text-white shadow-md shadow-emerald-950/50 transition-colors hover:from-emerald-400 hover:to-emerald-500" onClick={() => api.setMode("play")}>▶ Play</button>
          <button type="button" className={BTN} onClick={() => importInputRef.current?.click()}>Import</button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) importFile(file);
              event.target.value = "";
            }}
          />
          {docSave.available ? (
            <button
              type="button"
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                docSave.saveState === "error"
                  ? "bg-rose-600/90 text-white hover:bg-rose-500"
                  : docSave.dirty
                    ? "bg-gradient-to-b from-cyan-400 to-cyan-600 text-white shadow-md shadow-cyan-950/50 hover:from-cyan-300 hover:to-cyan-500"
                    : "bg-white/[0.04] text-neutral-400 ring-1 ring-inset ring-white/[0.06] hover:bg-white/10"
              }`}
              onClick={docSave.doSave}
              disabled={docSave.saveState === "saving"}
              title={docSave.saveError ?? "Write the scene to Games/<id>/src/editor.scene.json (Ctrl+S)"}
            >
              {docSave.saveState === "saving"
                ? "Saving…"
                : docSave.saveState === "error"
                  ? "Save failed"
                  : docSave.dirty
                    ? "Save"
                    : "Saved ✓"}
            </button>
          ) : null}
          <button type="button" className="rounded-md bg-cyan-500/20 px-2.5 py-1 font-medium text-cyan-200 ring-1 ring-inset ring-cyan-400/30 transition-colors hover:bg-cyan-500/30" onClick={() => { downloadText(`${gameId}-editor.json`, session.exportJson(true)); notify(`Exported ${gameId}-editor.json`); }}>Export</button>
          <button type="button" className={BTN} title="Copy document JSON to clipboard" onClick={copyExportJson}>⧉</button>
          <button type="button" className={`rounded-md px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors ${helpOpen ? "bg-white/15 text-neutral-100" : "bg-white/[0.04] hover:bg-white/10"}`} title="Keyboard shortcuts (?)" onClick={() => setHelpOpen((value) => !value)}>?</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <aside className="pointer-events-auto flex w-72 min-w-56 max-w-[42vw] resize-x flex-col overflow-hidden border-r border-white/[0.08] bg-[#0d0f13]/95 backdrop-blur-md">
            <div className="flex items-center gap-1 border-b border-white/[0.08] p-2">
              <button type="button" className={`rounded-md px-2 py-1 font-medium transition-colors ${activePanel === "outliner" ? "bg-white/10 text-neutral-100" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => showPanel("outliner")}>Hierarchy</button>
              <button type="button" className={`rounded-md px-2 py-1 font-medium transition-colors ${activePanel === "collections" ? "bg-white/10 text-neutral-100" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => showPanel("collections")}>Sets {state.document.collections.length}</button>
              <button type="button" className={`rounded-md px-2 py-1 font-medium transition-colors ${activePanel === "prefabs" ? "bg-white/10 text-neutral-100" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => showPanel("prefabs")}>Prefabs {state.document.prefabs.length}</button>
              <button type="button" className={`rounded-md px-2 py-1 font-medium transition-colors ${activePanel === "catalogs" ? "bg-white/10 text-neutral-100" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => showPanel("catalogs")}>Data {api.getCatalogDefinitions().length}</button>
              <button type="button" className="rounded-md px-2 py-1 text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200" onClick={() => showPanel("assets")}>Assets {assets.length}</button>
              <button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setLeftOpen(false)} aria-label="Close hierarchy panel">×</button>
            </div>
            {activePanel === "collections" ? (
              <CollectionsPanel session={session} />
            ) : activePanel === "prefabs" ? (
              <PrefabsPanel session={session} api={api} />
            ) : activePanel === "catalogs" ? (
              <CatalogsPanel session={session} definitions={api.getCatalogDefinitions()} />
            ) : (
              <>
                <div className="border-b border-white/[0.08] p-2">
                  <div className={`mb-1.5 ${MICRO}`}>Layers</div>
                  <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                    {allKinds.map((kind) => (
                      <label key={kind} className={`cursor-pointer rounded-full px-2.5 py-0.5 ring-1 ring-inset transition-colors ${visibility[kind] !== false ? "bg-cyan-500/15 text-cyan-200 ring-cyan-400/25" : "bg-black/30 text-neutral-600 ring-white/[0.06] hover:text-neutral-400"}`}>
                        <input type="checkbox" className="sr-only" checked={visibility[kind] !== false} onChange={(event) => { api.setVisibility({ ...api.getVisibility(), [kind]: event.target.checked }); setTick((value) => value + 1); }} />
                        {kind}
                      </label>
                    ))}
                    {allKinds.length === 0 ? <span className="text-neutral-600">No authored layers</span> : null}
                  </div>
                </div>
                <OutlinerPanel session={session} api={api} />
              </>
            )}
          </aside>
        ) : null}

        <main className="pointer-events-none relative min-w-0 flex-1">
          {uiState.tool === "terrain" ? <TerrainPanel session={session} ui={ui} /> : null}
          {placementHint !== null ? (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-400/30 bg-cyan-950/85 px-4 py-1.5 text-[11px] text-cyan-100 shadow-lg shadow-cyan-950/40 backdrop-blur-md">{placementHint}</div>
          ) : null}
          {toast !== null ? (
            <div className={`absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] shadow-lg backdrop-blur-md ${toast.tone === "error" ? "border-rose-400/40 bg-rose-950/90 text-rose-100 shadow-rose-950/40" : "border-emerald-400/30 bg-emerald-950/90 text-emerald-100 shadow-emerald-950/40"}`}>{toast.text}</div>
          ) : null}
          {helpOpen ? (
            <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]" onClick={() => setHelpOpen(false)}>
              <div className="w-[28rem] max-w-[90vw] rounded-2xl border border-white/10 bg-[#101216]/95 p-5 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
                <div className="mb-3 flex items-center">
                  <div className="text-sm font-semibold tracking-wide text-neutral-100">Keyboard shortcuts</div>
                  <button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts">×</button>
                </div>
                <div className="grid max-h-[60vh] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 overflow-auto">
                  {SHORTCUTS.map((entry) => (
                    <div key={entry.keys} className="contents">
                      <kbd className="justify-self-start whitespace-nowrap rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-cyan-200 ring-1 ring-inset ring-white/10">{entry.keys}</kbd>
                      <span className="text-neutral-300">{entry.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {uiState.contextMenu !== null ? (
            <EditorContextMenu
              x={uiState.contextMenu.clientX}
              y={uiState.contextMenu.clientY}
              actions={buildEditorContextMenu({
                hitId: uiState.contextMenu.hitId,
                selection: state.selection,
                canPaste: clipboardFragment !== null,
              })}
              onPick={runContextAction}
              onClose={closeContextMenu}
            />
          ) : null}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/[0.08] bg-black/70 px-4 py-1.5 text-[11px] text-neutral-400 shadow-lg shadow-black/40 backdrop-blur-md">
            <span>RMB orbit · MMB pan · click select · RMB menu · W/E/R · Ctrl+C/V · F frame · ? help</span>
            <span className="ml-3 text-neutral-500">{sceneStats.objects} objs{sceneStats.foliage > 0 ? ` · ≈${formatTriangles(sceneStats.foliage)} foliage` : ""}</span>
            {perf !== null ? <PerfPill perf={perf} /> : null}
          </div>
        </main>

        {rightOpen ? <InspectorPanel session={session} ui={ui} onClose={() => setRightOpen(false)} /> : null}
        {agentOpen ? <AgentPanel api={api} onClose={() => setAgentOpen(false)} /> : null}
      </div>

      {bottomOpen ? (
        <section className="pointer-events-auto flex h-64 min-h-40 max-h-[55vh] resize-y flex-col overflow-hidden border-t border-white/[0.08] bg-[#0d0f13]/95 backdrop-blur-md">
          <div className="flex items-center border-b border-white/[0.08] px-3 py-2"><div className={MICRO}>Asset browser</div><span className="ml-2 text-neutral-600">{assets.length} assets · Ctrl+B</span><button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setBottomOpen(false)} aria-label="Close asset browser">×</button></div>
          <div className="min-h-0 flex-1 overflow-hidden p-2"><AssetBrowser assets={assets} session={session} onPlace={placeAsset} /></div>
        </section>
      ) : null}
    </div>
  );
}
