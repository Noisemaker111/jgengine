import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  editorDocumentSize,
  editorParentOf,
  extractEditorFragment,
  type EditorDocument,
  type EditorSession,
} from "@jgengine/core/editor/index";
import { scatterRegionEstimate, SCATTER_PATH_KIND } from "@jgengine/core/world/scatterRegion";

import {
  editorAssetFromImport,
  mergeEditorAssets,
  type EditorAssetEntry,
} from "./AssetBrowser";
import { CatalogsPanel } from "./CatalogsPanel";
import { CollectionsPanel } from "./CollectionsPanel";
import { EditorContextMenu } from "./EditorContextMenu";
import { ParentPickerMenu } from "./ParentPickerMenu";
import { PrefabsPanel } from "./PrefabsPanel";
import { listParentCandidates } from "./parentCandidates";
import {
  buildEditorContextMenu,
  type EditorContextAction,
} from "./viewportContextMenu";
import { buildOutlinerGroups } from "./outlinerModel";
import type { EditorHostApi } from "./session";
import {
  importAssetToHost,
  loadDroppedAssets,
  type AssetImporter,
} from "./assetImport";
import { newPlacementId, type EditorUiStore, type PlacementTool } from "./uiStore";
import { useF2Chord } from "./useF2Chord";
import { TerrainPanel } from "./TerrainPanel";
import { LightingPanel } from "./LightingPanel";
import { InspectorPanel } from "./InspectorPanel";
import { BottomDock } from "./shell/BottomDock";
import { CommandPalette } from "./shell/CommandPalette";
import { HierarchyPanel } from "./shell/HierarchyPanel";
import { SceneToolbar } from "./shell/SceneToolbar";
import { StatusBar } from "./shell/StatusBar";
import { TopAppBar } from "./shell/TopAppBar";
import { OrientationWidget, PerformanceOverlay, ViewportUtilityPanel } from "./shell/ViewportOverlays";
import { NetworkWorkspacePanel } from "./shell/NetworkWorkspacePanel";
import { WorkspaceRail } from "./shell/WorkspaceRail";
import { buildPaletteCommands } from "./shell/commandRegistry";
import { createEditorConsoleStore } from "./shell/consoleStore";
import { installEditorConsoleSink } from "./shell/consoleSink";
import { Icon } from "./shell/icons";
import {
  createShellLayoutStore,
  type BottomDockTab,
  type EditorWorkspace,
  type LeftDockPage,
} from "./shell/layoutStore";
import { createPerfHistoryStore } from "./shell/perfHistory";
import { BORDER, FOCUS_RING } from "./shell/theme";
import { IconButton, Kbd, PanelResizer } from "./shell/ui";
import type { EditorNetworkSnapshot } from "./networkSnapshot";

let clipboardFragment: EditorDocument | null = null;

const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "W / E / R", action: "Move · rotate · scale gizmo" },
  { keys: "T", action: "Toggle terrain sculpt tool" },
  { keys: "F", action: "Frame selection (or whole scene)" },
  { keys: "G", action: "Toggle reference grid" },
  { keys: "N", action: "Cycle instances of selected row" },
  { keys: "Ctrl+K", action: "Command palette" },
  { keys: "Arrows", action: "Nudge selection on X/Z (Shift ×5)" },
  { keys: "PgUp / PgDn", action: "Nudge selection on Y (Shift ×5)" },
  { keys: "Ctrl+A", action: "Select all visible objects" },
  { keys: "Ctrl+C / X / V", action: "Copy · cut · paste selection" },
  { keys: "Ctrl+D", action: "Duplicate selection" },
  { keys: "Ctrl+Z / Y", action: "Undo · redo" },
  { keys: "Ctrl+B", action: "Content browser" },
  { keys: "Ctrl+S", action: "Save scene" },
  { keys: "Delete", action: "Remove selection" },
  { keys: "Enter / Esc", action: "Finish · cancel path drawing" },
  { keys: "Shift+click", action: "Multi-select · keep placing" },
  { keys: "RMB drag", action: "Orbit camera" },
  { keys: "MMB drag", action: "Pan camera" },
  { keys: "RMB click", action: "Context menu" },
  { keys: "F2+E", action: "Toggle editor ↔ play" },
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
  onResult?: (ok: boolean, detail: string) => void,
) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
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
        setLastSavedAt(Date.now());
        onResult?.(true, result.path === undefined ? "Scene saved" : `Scene saved to ${result.path}`);
      } else {
        setSaveError(result.error ?? "save failed");
        setSaveState("error");
        onResult?.(false, `Save failed: ${result.error ?? "unknown error"}`);
      }
    });
  };
  return { available: save !== undefined, dirty, saveState, saveError, lastSavedAt, doSave };
}

const LEFT_PAGES: readonly { id: LeftDockPage; label: string }[] = [
  { id: "hierarchy", label: "Hierarchy" },
  { id: "collections", label: "Sets" },
  { id: "prefabs", label: "Prefabs" },
  { id: "catalogs", label: "Data" },
];

/**
 * The full editor UI shell — global app bar, contextual scene toolbar, workspace rail, resizable
 * hierarchy/inspector docks, tabbed bottom dock (content browser, console, profiler, AI
 * assistant), viewport overlays, and status bar — wired to the session, UI store, layout store,
 * and host RPC. Mounted by `EditorApp`; not a game-author entry point.
 */
export function EditorChrome({
  gameId,
  session,
  api,
  assets,
  ui,
  baselineDocument,
  save,
  networkSnapshot,
  importAsset = importAssetToHost,
  onRegisterAsset,
}: {
  gameId: string;
  session: EditorSession;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  ui: EditorUiStore;
  /** The document as loaded — drives the header unsaved indicator by reference compare. */
  baselineDocument?: EditorDocument;
  save?: (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /**
   * Network workspace inspection payload (adapter config + optional host presence).
   * Built by `EditorApp` from the game definition; live presence rows only when the host injects them.
   */
  networkSnapshot: EditorNetworkSnapshot;
  /**
   * How dropped/imported models become durable. Default: the standalone host importer
   * (`POST /__jgengine/import-asset`); when no host answers, imports degrade to blob URLs.
   */
  importAsset?: AssetImporter;
  /**
   * Optional side-effect after a model import succeeds: register the id/url into the live game
   * asset catalog so AuthoredObjects can resolve the mesh without remounting the playable.
   */
  onRegisterAsset?: (id: string, url: string) => void;
}) {
  const [, setTick] = useState(0);
  const layoutRef = useRef<ReturnType<typeof createShellLayoutStore> | null>(null);
  layoutRef.current ??= createShellLayoutStore(gameId);
  const layout = layoutRef.current;
  const consoleRef = useRef<ReturnType<typeof createEditorConsoleStore> | null>(null);
  consoleRef.current ??= createEditorConsoleStore();
  const consoleStore = consoleRef.current;
  const perfHistoryRef = useRef<ReturnType<typeof createPerfHistoryStore> | null>(null);
  perfHistoryRef.current ??= createPerfHistoryStore();
  const perfHistory = perfHistoryRef.current;
  /** Models added this session via Content Browser Import / drop — merged over the game catalog. */
  const [importedAssets, setImportedAssets] = useState<readonly EditorAssetEntry[]>([]);
  const [importBusy, setImportBusy] = useState(false);

  // Bridge global RPC/agent console emits into the dock console for this chrome instance.
  useEffect(
    () =>
      installEditorConsoleSink((severity, source, message) => {
        consoleStore.log(severity, source, message);
      }),
    [consoleStore],
  );

  const liveAssets = useMemo(
    () => mergeEditorAssets(assets, importedAssets),
    [assets, importedAssets],
  );

  // Keep the host asset list in step with the browser so place_asset / list_assets see imports.
  useEffect(() => {
    api.setAssets(liveAssets);
  }, [api, liveAssets]);

  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback(
    (text: string, tone: "info" | "error" = "info") => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      setToast({ text, tone });
      toastTimer.current = setTimeout(() => setToast(null), 2600);
      consoleStore.log(tone === "error" ? "error" : "info", "ui", text);
    },
    [consoleStore],
  );
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const state = session.getState();
  const uiState = ui.getState();
  const layoutState = layout.getState();
  const docSave = useDocumentSave(session, save, (ok, detail) =>
    consoleStore.log(ok ? "info" : "error", "save", detail),
  );
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

  useF2Chord("KeyE", () => api.setMode("play"));

  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => ui.subscribe(() => setTick((value) => value + 1)), [ui]);
  useEffect(() => layout.subscribe(() => setTick((value) => value + 1)), [layout]);

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

  const [parentPicker, setParentPicker] = useState<{
    clientX: number;
    clientY: number;
    ids: readonly string[];
  } | null>(null);

  const openBottomTab = useCallback(
    (tab: BottomDockTab) => {
      layout.patch({ bottomOpen: true, bottomTab: tab });
    },
    [layout],
  );

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
            layout.patch({ leftOpen: true, leftPage: "prefabs" });
            notify(`Created prefab “${name}”`);
          }
          return;
        case "parentTo": {
          const ids =
            selection.length > 0
              ? selection
              : menu?.hitId !== null && menu?.hitId !== undefined
                ? [menu.hitId]
                : [];
          if (ids.length === 0 || menu === null) return;
          setParentPicker({ clientX: menu.clientX, clientY: menu.clientY, ids: [...ids] });
          return;
        }
        case "unparent": {
          const ids = selection.length > 0 ? selection : menu?.hitId !== null && menu?.hitId !== undefined ? [menu.hitId] : [];
          if (ids.length === 0) return;
          api.handle({ method: "set_parent", ids: [...ids], parentId: null });
          notify(ids.length === 1 ? "Unparented object" : `Unparented ${ids.length} objects`);
          return;
        }
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
          openBottomTab("content");
          return;
      }
    },
    [api, closeContextMenu, copySelection, layout, notify, openBottomTab, session, ui],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        docSaveRef.current.doSave();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteQuery((value) => (value === null ? "" : null));
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
        openBottomTab("content");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const current = session.getState();
        const visibility = api.getVisibility();
        const ids = [
          ...current.document.markers
            .filter((m) => visibility[m.kind] !== false && m.hidden !== true)
            .map((m) => m.id),
          ...current.document.volumes
            .filter((v) => visibility[v.kind] !== false && v.hidden !== true)
            .map((v) => v.id),
          ...current.document.paths
            .filter((p) => visibility[p.kind] !== false && p.hidden !== true)
            .map((p) => p.id),
          ...(visibility["note"] !== false
            ? current.document.annotations.filter((n) => n.hidden !== true).map((n) => n.id)
            : []),
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
        if (paletteQuery !== null) {
          setPaletteQuery(null);
          return;
        }
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
  }, [session, ui, api, notify, copySelection, openBottomTab, paletteQuery]);

  const placeAsset = (entry: EditorAssetEntry) => {
    const focus = api.getFocusTarget();
    const focused = session.getState();
    const focusedId = focused.selection[0];
    const selected =
      focused.document.markers.find((marker) => marker.id === focusedId)?.position ??
      focused.document.volumes.find((volume) => volume.id === focusedId)?.center;
    const position = focus ?? selected ?? { x: 0, y: 0, z: 0 };
    const response = api.handle({
      method: "place_asset",
      id: entry.id,
      kind: entry.kind === "model" ? "prop" : entry.kind,
      x: position.x,
      y: position.y,
      z: position.z,
    });
    if (response.ok) notify(`Placed ${entry.label}`);
    else notify(`Place failed: ${response.error ?? "unknown error"}`, "error");
  };

  const importModels = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0 || importBusy) return;
      setImportBusy(true);
      try {
        const next = await loadDroppedAssets(files, importAsset);
        if (next.length === 0) {
          notify("No .glb / .gltf models found in the drop", "error");
          return;
        }
        const entries = next.map(editorAssetFromImport);
        for (const entry of entries) {
          if (entry.url !== undefined) onRegisterAsset?.(entry.id, entry.url);
        }
        setImportedAssets((current) => mergeEditorAssets(current, entries));
        layout.patch({ bottomOpen: true, bottomTab: "content" });
        const durable = entries.filter((entry) => entry.url !== undefined && !entry.url.startsWith("blob:")).length;
        const ephemeral = entries.length - durable;
        if (ephemeral === 0) {
          notify(entries.length === 1 ? `Imported ${entries[0]!.label}` : `Imported ${entries.length} models`);
        } else if (durable === 0) {
          notify(
            entries.length === 1
              ? `Imported ${entries[0]!.label} (session-only — no host importer)`
              : `Imported ${entries.length} models (session-only — no host importer)`,
          );
        } else {
          notify(`Imported ${entries.length} models (${ephemeral} session-only)`);
        }
      } catch (error) {
        notify(`Import failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        setImportBusy(false);
      }
    },
    [importAsset, importBusy, layout, notify, onRegisterAsset],
  );

  const importFile = (file: File) => {
    void file.text().then((text) => {
      try {
        session.dispatch({ type: "importJson", json: text });
        const doc = session.getState().document;
        notify(`Imported ${editorDocumentSize(doc)} objects from ${file.name}`);
        consoleStore.log("info", "import", `Imported ${editorDocumentSize(doc)} objects from ${file.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid JSON";
        notify(`Import failed: ${message}`, "error");
        consoleStore.log("error", "import", `Import failed: ${message}`);
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

  const exportJson = () => {
    downloadText(`${gameId}-editor.json`, session.exportJson(true));
    notify(`Exported ${gameId}-editor.json`);
  };

  // Reference compare, not a serialize: stringifying the whole document per edit dispatch burned
  // milliseconds on every nudge/stroke. Undoing back to pristine may leave the dot on (history
  // restores clones), which is the cheap side of wrong for an unsaved-edits hint.
  const baselineDirty = baselineDocument !== undefined && state.document !== baselineDocument;
  const dirty = docSave.available ? docSave.dirty : baselineDirty;

  const startPlacement = (tool: PlacementTool) => {
    ui.startPlacement(tool);
  };

  const selectWorkspace = (workspace: EditorWorkspace) => {
    layout.setWorkspace(workspace);
    if (workspace === "materials") layout.patch({ rightOpen: true, inspectorTab: "materials" });
    if (workspace === "terrain") ui.setTool("terrain");
    else if (ui.getState().tool === "terrain") ui.setTool("select");
  };

  const paletteObjects = useMemo(() => {
    const doc = state.document;
    const objects: { id: string; label: string; kind: string }[] = [];
    for (const marker of doc.markers) objects.push({ id: marker.id, label: marker.label ?? marker.id, kind: marker.kind });
    for (const volume of doc.volumes) objects.push({ id: volume.id, label: volume.label ?? volume.id, kind: volume.kind });
    for (const path of doc.paths) objects.push({ id: path.id, label: path.label ?? path.id, kind: path.kind });
    for (const note of doc.annotations) objects.push({ id: note.id, label: note.text.slice(0, 48) || note.id, kind: "note" });
    return objects;
  }, [state.document]);

  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        setGizmoMode: (mode) => ui.patch({ gizmoMode: mode }),
        setTool: (tool) => ui.setTool(tool),
        toggleGrid: () => ui.patch({ showGrid: !ui.getState().showGrid }),
        toggleContours: () => ui.patch({ showContours: !ui.getState().showContours }),
        toggleSurfaceGrid: () => ui.patch({ showSurfaceGrid: !ui.getState().showSurfaceGrid }),
        toggleElevation: () => ui.patch({ showElevation: !ui.getState().showElevation }),
        setSnapMode: (mode) => ui.patch({ snapMode: mode }),
        frameAll: () => api.handle({ method: "camera_frame" }),
        frameSelection: () => {
          const selected = session.getState().selection[0];
          if (selected !== undefined) api.handle({ method: "camera_goto", id: selected });
          else api.handle({ method: "camera_frame" });
        },
        undo: () => session.dispatch({ type: "undo" }),
        redo: () => session.dispatch({ type: "redo" }),
        save: () => docSaveRef.current.doSave(),
        exportJson,
        importJson: () => importInputRef.current?.click(),
        copyJson: copyExportJson,
        setMode: (mode) => api.setMode(mode),
        startPlacement,
        openBottomTab,
        toggleLeftDock: () => layout.patch({ leftOpen: !layout.getState().leftOpen }),
        toggleRightDock: () => layout.patch({ rightOpen: !layout.getState().rightOpen }),
        toggleHelp: () => setHelpOpen((value) => !value),
        resetLayout: () => layout.reset(),
        objects: paletteObjects,
        gotoObject: (id) => {
          session.dispatch({ type: "select", ids: [id] });
          api.handle({ method: "camera_goto", id });
        },
      }),
    [api, layout, openBottomTab, paletteObjects, session, ui],
  );

  const placement = uiState.placement;
  const placementHint =
    placement === null
      ? null
      : placement.tool === "path"
        ? `Drawing ${placement.kind}: click to add points (${uiState.pathDraft.length}) · Enter finish · Esc cancel`
        : `Placing ${placement.tool === "note" ? "note" : placement.kind}: click the world · Shift-click places more · Esc cancel`;

  const railActive: EditorWorkspace = uiState.tool === "terrain" ? "terrain" : layoutState.workspace;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col text-xs text-neutral-100">
      <TopAppBar
        gameId={gameId}
        dirty={dirty}
        saveState={docSave.saveState}
        lastSavedAt={docSave.lastSavedAt}
        saveAvailable={docSave.available}
        saveError={docSave.saveError}
        canUndo={session.canUndo()}
        canRedo={session.canRedo()}
        onUndo={() => session.dispatch({ type: "undo" })}
        onRedo={() => session.dispatch({ type: "redo" })}
        onSave={docSave.doSave}
        onPlay={() => api.setMode("play")}
        onWalk={() => api.setMode("walk")}
        onHud={() => api.setMode("hud")}
        onImport={() => importInputRef.current?.click()}
        onExport={exportJson}
        onCopyJson={copyExportJson}
        onOpenPalette={() => setPaletteQuery("")}
        onToggleHelp={() => setHelpOpen((value) => !value)}
        onResetLayout={() => layout.reset()}
      />
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
      <SceneToolbar
        tool={uiState.tool}
        gizmoMode={uiState.gizmoMode}
        gizmoSpace={uiState.gizmoSpace}
        gizmoPivot={uiState.gizmoPivot}
        snapMode={uiState.snapMode}
        gridSize={uiState.gridSize}
        rotationSnapDeg={uiState.rotationSnapDeg}
        scaleSnap={uiState.scaleSnap}
        cameraProjection={uiState.cameraProjection}
        showGrid={uiState.showGrid}
        showContours={uiState.showContours}
        showSurfaceGrid={uiState.showSurfaceGrid}
        showElevation={uiState.showElevation}
        placementActive={placement !== null}
        onSetTool={(tool) => ui.setTool(tool)}
        onSetGizmoMode={(mode) => ui.patch({ gizmoMode: mode })}
        onSetGizmoSpace={(space) => ui.patch({ gizmoSpace: space })}
        onSetGizmoPivot={(pivot) => ui.patch({ gizmoPivot: pivot })}
        onSetSnapMode={(mode) => ui.patch({ snapMode: mode })}
        onSetGridSize={(size) => ui.patch({ gridSize: size })}
        onSetRotationSnapDeg={(deg) => ui.patch({ rotationSnapDeg: deg })}
        onSetScaleSnap={(snap) => ui.patch({ scaleSnap: snap })}
        onSetCameraProjection={(projection) => ui.patch({ cameraProjection: projection })}
        onToggleGrid={() => ui.patch({ showGrid: !uiState.showGrid })}
        onToggleContours={() => ui.patch({ showContours: !uiState.showContours })}
        onToggleSurfaceGrid={() => ui.patch({ showSurfaceGrid: !uiState.showSurfaceGrid })}
        onToggleElevation={() => ui.patch({ showElevation: !uiState.showElevation })}
        onFrame={() => {
          const selected = session.getState().selection[0];
          if (selected !== undefined) api.handle({ method: "camera_goto", id: selected });
          else api.handle({ method: "camera_frame" });
        }}
        onStartPlacement={startPlacement}
        onOpenAssistant={() => openBottomTab("assistant")}
        assistantOpen={layoutState.bottomOpen && layoutState.bottomTab === "assistant"}
      />

      <div className="flex min-h-0 flex-1">
        <WorkspaceRail active={railActive} onSelect={selectWorkspace} />

        {layoutState.leftOpen ? (
          <>
            <aside
              className={`pointer-events-auto hidden min-h-0 flex-col overflow-hidden border-r ${BORDER} bg-[#111318] sm:flex`}
              style={{ width: layoutState.leftWidth }}
              aria-label={layoutState.workspace === "multiplayer" ? "Network workspace dock" : "Scene hierarchy dock"}
            >
              <div className={`flex h-8 shrink-0 items-center gap-1 border-b ${BORDER} px-1.5`}>
                {layoutState.workspace === "multiplayer" ? (
                  <span className="px-2 text-[11px] font-medium text-neutral-200">Network</span>
                ) : (
                  LEFT_PAGES.map((page) => {
                    const badge =
                      page.id === "collections"
                        ? state.document.collections.length
                        : page.id === "prefabs"
                          ? state.document.prefabs.length
                          : page.id === "catalogs"
                            ? api.getCatalogDefinitions().length
                            : null;
                    const selected = layoutState.leftPage === page.id;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => layout.patch({ leftPage: page.id })}
                        className={`flex h-6.5 items-center gap-1 rounded-[5px] px-2 text-[11px] transition-colors ${FOCUS_RING} ${
                          selected ? "bg-white/[0.08] text-neutral-100" : "text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-300"
                        }`}
                      >
                        {page.label}
                        {badge !== null && badge > 0 ? <span className="text-[9px] tabular-nums text-neutral-500">{badge}</span> : null}
                      </button>
                    );
                  })
                )}
                <IconButton
                  icon="close"
                  label="Collapse hierarchy panel"
                  size={11}
                  tone="ghost"
                  className="ml-auto"
                  onClick={() => layout.patch({ leftOpen: false })}
                />
              </div>
              {layoutState.workspace === "multiplayer" ? (
                <NetworkWorkspacePanel snapshot={networkSnapshot} />
              ) : layoutState.leftPage === "collections" ? (
                <CollectionsPanel session={session} />
              ) : layoutState.leftPage === "prefabs" ? (
                <PrefabsPanel session={session} api={api} />
              ) : layoutState.leftPage === "catalogs" ? (
                <CatalogsPanel session={session} definitions={api.getCatalogDefinitions()} />
              ) : (
                <HierarchyPanel
                  session={session}
                  api={api}
                  onAdd={() => setPaletteQuery("add ")}
                  onRowContextMenu={(point, id) => {
                    const current = session.getState().selection;
                    if (!current.includes(id)) session.dispatch({ type: "select", ids: [id] });
                    ui.patch({
                      contextMenu: {
                        clientX: point.clientX,
                        clientY: point.clientY,
                        hitId: id,
                        ground: null,
                      },
                    });
                  }}
                />
              )}
            </aside>
            <PanelResizer orientation="vertical" label="Resize hierarchy panel" onResize={(delta) => layout.resize("leftWidth", delta)} />
          </>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="pointer-events-none relative min-h-0 min-w-0 flex-1">
            <PerformanceOverlay api={api} />
            {uiState.tool === "terrain" ? (
              <TerrainPanel session={session} ui={ui} api={api} />
            ) : layoutState.workspace === "lighting" ? (
              <LightingPanel session={session} />
            ) : (
              <ViewportUtilityPanel document={state.document} api={api} selectionCount={state.selection.length} />
            )}
            <OrientationWidget />
            {!layoutState.leftOpen ? (
              <div className="pointer-events-auto absolute left-2.5 top-1/2 z-30 -translate-y-1/2">
                <IconButton icon="chevronRight" label="Open hierarchy panel" onClick={() => layout.patch({ leftOpen: true })} />
              </div>
            ) : null}
            {!layoutState.rightOpen ? (
              <div className="pointer-events-auto absolute right-2.5 top-1/2 z-30 -translate-y-1/2">
                <IconButton icon="panel" label="Open inspector panel" onClick={() => layout.patch({ rightOpen: true })} />
              </div>
            ) : null}
            {placementHint !== null ? (
              <div className="absolute left-1/2 top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-400/30 bg-cyan-950/85 px-4 py-1.5 text-[11px] text-cyan-100 shadow-lg shadow-cyan-950/40 backdrop-blur-md">
                {placementHint}
              </div>
            ) : null}
            {toast !== null ? (
              <div
                className={`absolute left-1/2 top-10 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border px-4 py-1.5 text-[11px] shadow-lg backdrop-blur-md ${
                  toast.tone === "error"
                    ? "border-rose-400/40 bg-rose-950/90 text-rose-100 shadow-rose-950/40"
                    : "border-emerald-400/30 bg-emerald-950/90 text-emerald-100 shadow-emerald-950/40"
                }`}
              >
                {toast.text}
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
                  canUnparent: (() => {
                    const ids =
                      state.selection.length > 0
                        ? state.selection
                        : uiState.contextMenu.hitId !== null
                          ? [uiState.contextMenu.hitId]
                          : [];
                    return ids.some((id) => editorParentOf(state.document, id) !== undefined);
                  })(),
                })}
                onPick={runContextAction}
                onClose={closeContextMenu}
              />
            ) : null}
            {parentPicker !== null ? (
              <ParentPickerMenu
                x={parentPicker.clientX}
                y={parentPicker.clientY}
                candidates={listParentCandidates(state.document, parentPicker.ids)}
                onPick={(parentId) => {
                  const ids = [...parentPicker.ids];
                  setParentPicker(null);
                  const result = api.handle({ method: "set_parent", ids, parentId });
                  if (!result.ok) {
                    notify(result.error ?? "Parent to failed", "error");
                    return;
                  }
                  if (parentId === null) {
                    notify(ids.length === 1 ? "Unparented object" : `Unparented ${ids.length} objects`);
                  } else {
                    notify(
                      ids.length === 1
                        ? `Parented to ${parentId}`
                        : `Parented ${ids.length} objects to ${parentId}`,
                    );
                  }
                }}
                onClose={() => setParentPicker(null)}
              />
            ) : null}
          </main>

          {layoutState.bottomOpen ? (
            <>
              <PanelResizer orientation="horizontal" label="Resize bottom dock" sign={-1} onResize={(delta) => layout.resize("bottomHeight", delta)} />
              <div className="flex shrink-0 flex-col" style={{ height: layoutState.bottomHeight }}>
                <BottomDock
                  tab={layoutState.bottomTab}
                  onSelectTab={(tab) => layout.patch({ bottomTab: tab })}
                  onClose={() => layout.patch({ bottomOpen: false })}
                  assets={liveAssets}
                  session={session}
                  api={api}
                  consoleStore={consoleStore}
                  perfHistory={perfHistory}
                  browserView={layoutState.browserView}
                  onSetBrowserView={(view) => layout.patch({ browserView: view })}
                  onPlaceAsset={placeAsset}
                  onImportModels={importModels}
                  importBusy={importBusy}
                />
              </div>
            </>
          ) : (
            <div className={`pointer-events-auto flex h-7 shrink-0 items-center gap-1 border-t ${BORDER} bg-[#0e1014] px-1.5`}>
              {(
                [
                  ["content", "Content Browser"],
                  ["console", "Console"],
                  ["profiler", "Profiler"],
                  ["animation", "Animation"],
                  ["assistant", "AI Assistant"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openBottomTab(id)}
                  className={`rounded-[4px] px-2 py-0.5 text-[10px] text-neutral-500 transition-colors hover:bg-white/[0.05] hover:text-neutral-300 ${FOCUS_RING}`}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[9px] text-neutral-600">Ctrl+B opens the content browser</span>
            </div>
          )}
        </div>

        {layoutState.rightOpen ? (
          <>
            <PanelResizer orientation="vertical" label="Resize inspector panel" sign={-1} onResize={(delta) => layout.resize("rightWidth", delta)} />
            <aside
              className={`pointer-events-auto hidden min-h-0 flex-col overflow-hidden border-l ${BORDER} bg-[#111318] md:flex`}
              style={{ width: layoutState.rightWidth }}
              aria-label="Inspector dock"
            >
              <InspectorPanel
                session={session}
                ui={ui}
                api={api}
                tab={layoutState.inspectorTab}
                onSelectTab={(tab) => layout.patch({ inspectorTab: tab })}
                collapsed={layoutState.collapsed}
                onToggleSection={(id) => layout.toggleSection(id)}
                onClose={() => layout.patch({ rightOpen: false })}
              />
            </aside>
          </>
        ) : null}
      </div>

      <StatusBar
        api={api}
        history={perfHistory}
        objects={sceneStats.objects}
        foliage={sceneStats.foliage}
        selectionCount={state.selection.length}
        autosave
      />

      {paletteQuery !== null ? (
        <CommandPalette commands={paletteCommands} initialQuery={paletteQuery} onClose={() => setPaletteQuery(null)} />
      ) : null}

      {helpOpen ? (
        <div
          className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-[28rem] max-w-[90vw] rounded-[10px] border border-white/10 bg-[#14171d] p-5 shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="mb-3 flex items-center">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-neutral-100">
                <Icon name="command" size={15} className="text-cyan-300" />
                Keyboard shortcuts
              </div>
              <IconButton icon="close" label="Close shortcuts" tone="ghost" className="ml-auto" onClick={() => setHelpOpen(false)} />
            </div>
            <div className="grid max-h-[60vh] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 overflow-auto">
              {SHORTCUTS.map((entry) => (
                <div key={entry.keys} className="contents">
                  <span className="justify-self-start">
                    <Kbd>{entry.keys}</Kbd>
                  </span>
                  <span className="text-neutral-300">{entry.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
