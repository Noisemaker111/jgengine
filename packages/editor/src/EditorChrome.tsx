import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  editorDocumentSize,
  extractEditorFragment,
  findEditorNote,
  findEditorPath,
  listEditorKinds,
  WELL_KNOWN_MARKER_KINDS,
  type EditorDocument,
  type EditorSession,
} from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/react/provider";

import { AssetBrowser, type EditorAssetEntry } from "./AssetBrowser";
import type { EditorHostApi, EditorPerfSample } from "./session";
import type { EditorUiStore, PlacementTool, SnapMode } from "./uiStore";
import { useF2Chord } from "./useF2Chord";

const PERF_POLL_MS = 500;

type WorkspacePanel = "outliner" | "assets";

const ADD_VOLUME_ENTRIES: readonly { label: string; tool: PlacementTool }[] = [
  { label: "Zone (sphere)", tool: { tool: "volume", kind: "zone", shape: "sphere" } },
  { label: "Zone (box)", tool: { tool: "volume", kind: "zone", shape: "box" } },
  { label: "Zone (cylinder)", tool: { tool: "volume", kind: "zone", shape: "cylinder" } },
  { label: "Aggro range", tool: { tool: "volume", kind: "aggro", shape: "sphere" } },
  { label: "Leash range", tool: { tool: "volume", kind: "leash", shape: "sphere" } },
  { label: "Discover area", tool: { tool: "volume", kind: "discover", shape: "sphere" } },
  { label: "Capture area", tool: { tool: "volume", kind: "capture", shape: "cylinder" } },
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

interface OutlinerRow {
  label: string;
  ids: string[];
}

interface OutlinerGroup {
  kind: string;
  rows: OutlinerRow[];
  total: number;
}

function buildOutlinerGroups(document: {
  markers: readonly { id: string; kind: string; label?: string }[];
  volumes: readonly { id: string; kind: string; label?: string }[];
  paths: readonly { id: string; kind: string; label?: string }[];
  annotations: readonly { id: string; text: string }[];
}): OutlinerGroup[] {
  const byKind = new Map<string, Map<string, OutlinerRow>>();
  const push = (kind: string, label: string, id: string) => {
    let labels = byKind.get(kind);
    if (labels === undefined) {
      labels = new Map();
      byKind.set(kind, labels);
    }
    const row = labels.get(label);
    if (row === undefined) labels.set(label, { label, ids: [id] });
    else row.ids.push(id);
  };
  for (const marker of document.markers) push(marker.kind, marker.label ?? marker.id, marker.id);
  for (const volume of document.volumes) push(volume.kind, volume.label ?? volume.id, volume.id);
  for (const path of document.paths) push(path.kind, path.label ?? path.id, path.id);
  for (const note of document.annotations) push("note", note.text.slice(0, 40) || note.id, note.id);
  return [...byKind.entries()]
    .map(([kind, labels]) => {
      const rows = [...labels.values()];
      return { kind, rows, total: rows.reduce((sum, row) => sum + row.ids.length, 0) };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

function filterOutlinerGroups(groups: readonly OutlinerGroup[], query: string): OutlinerGroup[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...groups];
  return groups
    .map((group) => {
      const kindMatches = group.kind.toLowerCase().includes(normalized);
      const rows = kindMatches
        ? group.rows
        : group.rows.filter((row) => row.label.toLowerCase().includes(normalized));
      return { ...group, rows, total: rows.reduce((sum, row) => sum + row.ids.length, 0) };
    })
    .filter((group) => group.rows.length > 0);
}

let clipboardFragment: EditorDocument | null = null;

const SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: "W / E / R", action: "Move · rotate · scale gizmo" },
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
  { keys: "F2+E", action: "Toggle editor ↔ play" },
  { keys: "F2", action: "Engine devtools" },
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

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="uppercase text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        className="w-32 rounded border border-white/10 bg-black/40 px-2 py-1"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          onCommit(next);
        }}
      />
    </label>
  );
}

function KindColorFields({
  kind,
  color,
  onKind,
  onColor,
}: {
  kind: string;
  color: string | undefined;
  onKind: (kind: string) => void;
  onColor: (color: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="uppercase text-neutral-500">kind</span>
        <input
          className="w-full min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1"
          value={kind}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (next.length > 0) onKind(next);
          }}
        />
      </label>
      <input
        type="color"
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-white/10 bg-black/40"
        title="Display color"
        value={color ?? "#ffffff"}
        onChange={(event) => onColor(event.target.value)}
      />
      {color !== undefined ? (
        <button type="button" className="shrink-0 rounded bg-white/5 px-1.5 py-1 text-neutral-400 hover:bg-white/10" title="Reset to kind default color" onClick={() => onColor(undefined)}>↺</button>
      ) : null}
    </div>
  );
}

/** The editor's dockable workspace chrome: hierarchy, assets, inspector, and toolbar. */
export function EditorChrome({
  gameId,
  session,
  api,
  assets,
  ui,
  baselineJson,
}: {
  gameId: string;
  session: EditorSession;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  ui: EditorUiStore;
  baselineJson?: string;
}) {
  const [, setTick] = useState(0);
  const [activePanel, setActivePanel] = useState<WorkspacePanel>("outliner");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [outlinerQuery, setOutlinerQuery] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({});
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

  const outlinerGroups = useMemo(() => buildOutlinerGroups(state.document), [state.document]);
  const visibleOutlinerGroups = useMemo(
    () => filterOutlinerGroups(outlinerGroups, outlinerQuery),
    [outlinerGroups, outlinerQuery],
  );
  const outlinerGroupsRef = useRef(outlinerGroups);
  outlinerGroupsRef.current = outlinerGroups;

  const selectRow = (id: string, additive: boolean) => {
    if (additive) {
      const selection = session.getState().selection;
      const next = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
      session.dispatch({ type: "select", ids: next });
      return;
    }
    session.dispatch({ type: "select", ids: [id] });
    api.handle({ method: "camera_goto", id });
  };

  const showPanel = (panel: WorkspacePanel) => {
    setActivePanel(panel);
    if (panel === "assets") setBottomOpen(true);
    else setLeftOpen(true);
  };

  useF2Chord("KeyE", () => api.setMode("play"));

  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => ui.subscribe(() => setTick((value) => value + 1)), [ui]);
  useEffect(() => {
    const copySelection = (): number => {
      const state = session.getState();
      if (state.selection.length === 0) return 0;
      const fragment = extractEditorFragment(state.document, state.selection);
      const count = editorDocumentSize(fragment);
      if (count === 0) return 0;
      clipboardFragment = fragment;
      if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(JSON.stringify(fragment, null, 2)).catch(() => {});
      }
      return count;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
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
  }, [session, ui, api, notify]);

  const ctx = useGameContext();
  const kinds = useMemo(() => listEditorKinds(state.document), [state.document]);
  const selection = state.selection;
  const selectedId = selection[0];
  const selectedMarker = state.document.markers.find((marker) => marker.id === selectedId);
  const selectedVolume = state.document.volumes.find((volume) => volume.id === selectedId);
  const selectedPath = selectedId === undefined ? undefined : findEditorPath(state.document, selectedId);
  const selectedNote = selectedId === undefined ? undefined : findEditorNote(state.document, selectedId);
  const documentMiss =
    selectedId !== undefined &&
    selectedMarker === undefined &&
    selectedVolume === undefined &&
    selectedPath === undefined &&
    selectedNote === undefined;
  const liveEntity = documentMiss ? ctx.scene.entity.get(selectedId) : null;
  const liveObject = documentMiss && liveEntity === null ? ctx.scene.object.get(selectedId) : null;

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

  const placeAsset = (entry: EditorAssetEntry) => {
    const focus = api.getFocusTarget();
    const selected = selectedMarker?.position ?? selectedVolume?.center;
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

  const currentJson = useMemo(() => session.exportJson(true), [session, state.document]);
  const dirty = baselineJson !== undefined && currentJson !== baselineJson;

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
      <header className="pointer-events-auto flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-neutral-950/90 px-2 backdrop-blur">
        <button type="button" className="rounded px-2 py-1 font-semibold tracking-wide text-cyan-300 hover:bg-white/10" onClick={() => setLeftOpen((value) => !value)} aria-label="Toggle hierarchy panel">JG</button>
        <span className="hidden text-neutral-500 sm:inline">
          {gameId}
          {dirty ? <span className="ml-1 text-amber-400" title="Unsaved edits — Export to save">●</span> : null}
        </span>
        <div className="mx-1 h-5 w-px bg-white/10" />
        {(["translate", "rotate", "scale"] as const).map((mode) => (
          <button key={mode} type="button" className={`rounded px-2 py-1 capitalize ${gizmoMode === mode ? "bg-cyan-700/80 text-white" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`} onClick={() => ui.patch({ gizmoMode: mode })}>
            {mode} <span className="text-neutral-400">{mode === "translate" ? "W" : mode === "rotate" ? "E" : "R"}</span>
          </button>
        ))}
        <div className="h-5 w-px bg-white/10" />
        <div className="relative">
          <button type="button" className={`rounded px-2 py-1 ${addOpen || placement !== null ? "bg-cyan-700/80 text-white" : "bg-white/5 hover:bg-white/10"}`} onClick={() => setAddOpen((value) => !value)}>+ Add</button>
          {addOpen ? (
            <div className="absolute left-0 top-8 z-50 max-h-[60vh] w-52 overflow-auto rounded border border-white/10 bg-neutral-900/95 p-1 shadow-xl backdrop-blur">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Markers</div>
              {WELL_KNOWN_MARKER_KINDS.map((kind) => (
                <button key={kind} type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => startPlacement({ tool: "marker", kind })}>{kind}</button>
              ))}
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Volumes</div>
              {ADD_VOLUME_ENTRIES.map((entry) => (
                <button key={entry.label} type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => startPlacement(entry.tool)}>{entry.label}</button>
              ))}
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Other</div>
              <button type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => startPlacement({ tool: "path", kind: "route" })}>Draw path (route)</button>
              <button type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => startPlacement({ tool: "path", kind: "road" })}>Draw road</button>
              <button type="button" className="block w-full rounded px-2 py-1 text-left hover:bg-white/10" onClick={() => startPlacement({ tool: "note" })}>Note</button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded bg-white/5 px-2 py-1 hover:bg-white/10"
          onClick={() => {
            const at = SNAP_MODES.findIndex((entry) => entry.mode === uiState.snapMode);
            ui.patch({ snapMode: SNAP_MODES[(at + 1) % SNAP_MODES.length]!.mode });
          }}
        >
          {SNAP_MODES.find((entry) => entry.mode === uiState.snapMode)?.label}
          {uiState.snapMode === "grid" ? ` ${uiState.gridSize}` : ""}
        </button>
        {uiState.snapMode === "grid" ? (
          <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => ui.patch({ gridSize: uiState.gridSize >= 8 ? 0.5 : uiState.gridSize * 2 })}>±</button>
        ) : null}
        <button type="button" className={`rounded px-2 py-1 ${uiState.showGrid ? "bg-white/10" : "bg-white/5 text-neutral-500"} hover:bg-white/15`} onClick={() => ui.patch({ showGrid: !uiState.showGrid })}>Grid G</button>
        <div className="h-5 w-px bg-white/10" />
        <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => api.handle({ method: "camera_frame" })}>Frame all</button>
        <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-40" onClick={() => session.dispatch({ type: "undo" })} disabled={!session.canUndo()}>Undo</button>
        <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10 disabled:opacity-40" onClick={() => session.dispatch({ type: "redo" })} disabled={!session.canRedo()}>Redo</button>
        <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => showPanel("assets")}>Assets</button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => setRightOpen((value) => !value)}>Inspector</button>
          <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => api.setMode("walk")}>Walk</button>
          <button type="button" className="rounded bg-emerald-700/80 px-3 py-1 font-medium hover:bg-emerald-600" onClick={() => api.setMode("play")}>▶ Play</button>
          <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" onClick={() => importInputRef.current?.click()}>Import</button>
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
          <button type="button" className="rounded bg-cyan-700/80 px-2 py-1 hover:bg-cyan-600" onClick={() => { downloadText(`${gameId}-editor.json`, session.exportJson(true)); notify(`Exported ${gameId}-editor.json`); }}>Export</button>
          <button type="button" className="rounded bg-white/5 px-2 py-1 hover:bg-white/10" title="Copy document JSON to clipboard" onClick={copyExportJson}>⧉</button>
          <button type="button" className={`rounded px-2 py-1 ${helpOpen ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`} title="Keyboard shortcuts (?)" onClick={() => setHelpOpen((value) => !value)}>?</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <aside className="pointer-events-auto flex w-72 min-w-56 max-w-[42vw] resize-x flex-col overflow-hidden border-r border-white/10 bg-neutral-950/90 backdrop-blur">
            <div className="flex items-center gap-1 border-b border-white/10 p-2">
              <button type="button" className={`rounded px-2 py-1 ${activePanel === "outliner" ? "bg-white/15" : "hover:bg-white/10"}`} onClick={() => showPanel("outliner")}>Hierarchy</button>
              <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={() => showPanel("assets")}>Assets {assets.length}</button>
              <button type="button" className="ml-auto rounded px-2 py-1 text-neutral-400 hover:bg-white/10" onClick={() => setLeftOpen(false)} aria-label="Close hierarchy panel">×</button>
            </div>
            <div className="border-b border-white/10 p-2">
              <input type="search" value={outlinerQuery} onChange={(event) => setOutlinerQuery(event.target.value)} placeholder="Search objects and kinds…" className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 outline-none placeholder:text-neutral-600 focus:border-cyan-600" />
            </div>
            <div className="border-b border-white/10 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Layers</div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                {allKinds.map((kind) => (
                  <label key={kind} className={`cursor-pointer rounded px-2 py-1 ${visibility[kind] !== false ? "bg-white/10 text-neutral-200" : "bg-black/30 text-neutral-600"}`}>
                    <input type="checkbox" className="sr-only" checked={visibility[kind] !== false} onChange={(event) => { api.setVisibility({ ...api.getVisibility(), [kind]: event.target.checked }); setTick((value) => value + 1); }} />
                    {kind}
                  </label>
                ))}
                {allKinds.length === 0 ? <span className="text-neutral-600">No authored layers</span> : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
              {visibleOutlinerGroups.map((group) => {
                const collapsed = collapsedKinds[group.kind] === true;
                return (
                  <div key={group.kind}>
                    <button type="button" className="flex w-full items-center gap-1 rounded px-1 py-1 text-left font-medium text-neutral-300 hover:bg-white/10" onClick={() => setCollapsedKinds((previous) => ({ ...previous, [group.kind]: !collapsed }))}>
                      <span className="w-3 text-neutral-500">{collapsed ? "▸" : "▾"}</span><span>{group.kind}</span><span className="ml-auto text-neutral-500">{group.total}</span>
                    </button>
                    {collapsed ? null : group.rows.map((row) => {
                      const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                      const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                      return (
                        <button key={`${group.kind}:${row.label}`} type="button" className={`block w-full truncate rounded py-1 pl-5 pr-1.5 text-left ${rowSelected ? "bg-cyan-700/50" : "hover:bg-white/10"}`} onClick={(event) => selectRow(row.ids[0]!, event.ctrlKey || event.metaKey || event.shiftKey)}>
                          {row.label}{row.ids.length > 1 ? <span className="text-neutral-500"> ×{row.ids.length}{rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {visibleOutlinerGroups.length === 0 ? <div className="p-3 text-center text-neutral-600">No matching objects</div> : null}
            </div>
          </aside>
        ) : null}

        <main className="pointer-events-none relative min-w-0 flex-1">
          {placementHint !== null ? (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded border border-cyan-500/40 bg-cyan-950/80 px-3 py-1 text-[11px] text-cyan-100 backdrop-blur">{placementHint}</div>
          ) : null}
          {toast !== null ? (
            <div className={`absolute left-1/2 top-10 -translate-x-1/2 rounded border px-3 py-1 text-[11px] backdrop-blur ${toast.tone === "error" ? "border-rose-500/50 bg-rose-950/85 text-rose-100" : "border-emerald-500/40 bg-emerald-950/85 text-emerald-100"}`}>{toast.text}</div>
          ) : null}
          {helpOpen ? (
            <div className="pointer-events-auto absolute left-1/2 top-1/2 z-50 w-[26rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-neutral-950/95 p-4 shadow-2xl backdrop-blur">
              <div className="mb-2 flex items-center">
                <div className="font-semibold text-neutral-200">Keyboard shortcuts</div>
                <button type="button" className="ml-auto rounded px-2 py-1 text-neutral-400 hover:bg-white/10" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts">×</button>
              </div>
              <div className="grid max-h-[60vh] grid-cols-[auto_1fr] gap-x-4 gap-y-1 overflow-auto">
                {SHORTCUTS.map((entry) => (
                  <div key={entry.keys} className="contents">
                    <span className="whitespace-nowrap font-mono text-cyan-300">{entry.keys}</span>
                    <span className="text-neutral-300">{entry.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded border border-white/10 bg-black/60 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
            <span>Orbit · click select · W/E/R transform · Ctrl+C/V copy/paste · F frame · ? help · F2+E play</span>
            {perf !== null ? <span className={`ml-3 ${perf.fps < 30 ? "text-rose-400" : "text-emerald-400"}`}>{perf.fps.toFixed(0)} fps · {perf.drawCalls} draws · {formatTriangles(perf.triangles)} tris</span> : null}
          </div>
        </main>

        {rightOpen ? (
          <aside className="pointer-events-auto flex w-72 min-w-56 max-w-[42vw] resize-x flex-col overflow-auto border-l border-white/10 bg-neutral-950/90 p-3 backdrop-blur" style={{ direction: "rtl" }}>
            <div className="flex-1" style={{ direction: "ltr" }}>
              <div className="flex items-center"><div className="font-medium text-neutral-300">Inspector</div><button type="button" className="ml-auto rounded px-2 py-1 text-neutral-400 hover:bg-white/10" onClick={() => setRightOpen(false)} aria-label="Close inspector panel">×</button></div>
              {selection.length > 1 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-cyan-200">{selection.length} objects selected</div>
                  <div className="max-h-32 space-y-0.5 overflow-auto text-neutral-500">
                    {selection.map((id) => <div key={id} className="truncate">{id}</div>)}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => session.dispatch({ type: "duplicate", ids: selection })}>Duplicate</button>
                    <button type="button" className="rounded bg-rose-900/70 px-2 py-1 hover:bg-rose-800" onClick={() => session.dispatch({ type: "removeMany", ids: selection })}>Delete all</button>
                  </div>
                </div>
              ) : null}
              {selection.length <= 1 && selectedMarker !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-cyan-200" value={selectedMarker.label ?? ""} placeholder={selectedMarker.id} onChange={(event) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedMarker.id}` })} />
                  <div className="text-neutral-500">{selectedMarker.kind} · {selectedMarker.id}</div>
                  <KindColorFields
                    kind={selectedMarker.kind}
                    color={selectedMarker.color}
                    onKind={(kind) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { kind } }, { coalesce: `kind:${selectedMarker.id}` })}
                    onColor={(color) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { color } }, { coalesce: `color:${selectedMarker.id}` })}
                  />
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={axis} value={selectedMarker.position[axis]} onCommit={(value) => session.dispatch({ type: "setTransform", id: selectedMarker.id, position: { ...selectedMarker.position, [axis]: value } }, { coalesce: `pos:${axis}:${selectedMarker.id}` })} />
                  ))}
                  <NumberField label="rot°" step={5} value={Math.round(((selectedMarker.rotationY ?? 0) * 180) / Math.PI)} onCommit={(value) => session.dispatch({ type: "setTransform", id: selectedMarker.id, rotationY: (value * Math.PI) / 180 }, { coalesce: `rot:${selectedMarker.id}` })} />
                  {selectedMarker.meta !== undefined ? <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] text-neutral-400">{JSON.stringify(selectedMarker.meta, null, 2)}</pre> : null}
                </div>
              ) : null}
              {selection.length <= 1 && selectedVolume !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-cyan-200" value={selectedVolume.label ?? ""} placeholder={selectedVolume.id} onChange={(event) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedVolume.id}` })} />
                  <div className="text-neutral-500">{selectedVolume.kind} · {selectedVolume.shape}</div>
                  <KindColorFields
                    kind={selectedVolume.kind}
                    color={selectedVolume.color}
                    onKind={(kind) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { kind } }, { coalesce: `kind:${selectedVolume.id}` })}
                    onColor={(color) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { color } }, { coalesce: `color:${selectedVolume.id}` })}
                  />
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={axis} value={selectedVolume.center[axis]} onCommit={(value) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { center: { ...selectedVolume.center, [axis]: value } } }, { coalesce: `center:${axis}:${selectedVolume.id}` })} />
                  ))}
                  {selectedVolume.shape !== "box" ? (
                    <NumberField label="radius" value={selectedVolume.radius ?? 5} onCommit={(value) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { radius: Math.max(0.5, value) } }, { coalesce: `radius:${selectedVolume.id}` })} />
                  ) : null}
                  {selectedVolume.shape === "cylinder" ? (
                    <NumberField label="height" value={selectedVolume.height ?? 4} onCommit={(value) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { height: Math.max(0.5, value) } }, { coalesce: `height:${selectedVolume.id}` })} />
                  ) : null}
                  {selectedVolume.shape === "box" ? (
                    (["x", "y", "z"] as const).map((axis) => (
                      <NumberField key={axis} label={`half ${axis}`} value={selectedVolume.halfExtents?.[axis] ?? 5} onCommit={(value) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { halfExtents: { x: selectedVolume.halfExtents?.x ?? 5, y: selectedVolume.halfExtents?.y ?? 5, z: selectedVolume.halfExtents?.z ?? 5, [axis]: Math.max(0.5, value) } } }, { coalesce: `he:${axis}:${selectedVolume.id}` })} />
                    ))
                  ) : null}
                </div>
              ) : null}
              {selection.length <= 1 && selectedPath !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-cyan-200" value={selectedPath.label ?? ""} placeholder={selectedPath.id} onChange={(event) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedPath.id}` })} />
                  <div className="text-neutral-500">{selectedPath.kind} · {selectedPath.points.length} points</div>
                  <KindColorFields
                    kind={selectedPath.kind}
                    color={selectedPath.color}
                    onKind={(kind) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { kind } }, { coalesce: `kind:${selectedPath.id}` })}
                    onColor={(color) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { color } }, { coalesce: `color:${selectedPath.id}` })}
                  />
                  <NumberField label="width" value={selectedPath.width ?? 4} onCommit={(value) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { width: Math.max(0.5, value) } }, { coalesce: `width:${selectedPath.id}` })} />
                  {uiState.pathPoint !== null && uiState.pathPoint.pathId === selectedPath.id ? (
                    <div className="space-y-2">
                      <div className="text-neutral-400">Point {uiState.pathPoint.index + 1}/{selectedPath.points.length}</div>
                      <div className="flex gap-2">
                        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => { const at = uiState.pathPoint!.index; const points = [...selectedPath.points.slice(0, at + 1), { ...selectedPath.points[at]! }, ...selectedPath.points.slice(at + 1)]; session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Insert point</button>
                        <button type="button" className="rounded bg-rose-900/70 px-2 py-1 hover:bg-rose-800 disabled:opacity-40" disabled={selectedPath.points.length <= 2} onClick={() => { const points = selectedPath.points.filter((_, index) => index !== uiState.pathPoint!.index); ui.patch({ pathPoint: null }); session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Delete point</button>
                      </div>
                    </div>
                  ) : <div className="text-[10px] text-neutral-500">Click a vertex sphere to edit points.</div>}
                </div>
              ) : null}
              {selection.length <= 1 && selectedNote !== undefined ? (
                <div className="mt-3 space-y-2">
                  <div className="text-neutral-500">note · {selectedNote.id}</div>
                  <textarea className="h-24 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-neutral-100" value={selectedNote.text} onChange={(event) => session.dispatch({ type: "setNote", id: selectedNote.id, patch: { text: event.target.value } }, { coalesce: `text:${selectedNote.id}` })} />
                  {(["x", "y", "z"] as const).map((axis) => (
                    <NumberField key={axis} label={axis} value={selectedNote.position[axis]} onCommit={(value) => session.dispatch({ type: "setNote", id: selectedNote.id, patch: { position: { ...selectedNote.position, [axis]: value } } }, { coalesce: `npos:${axis}:${selectedNote.id}` })} />
                  ))}
                </div>
              ) : null}
              {liveEntity !== null ? <div className="mt-3 space-y-1"><div className="text-cyan-200">{liveEntity.name}</div><div className="text-neutral-500">live entity · {liveEntity.role} · {liveEntity.id}</div><div className="text-neutral-400">x {liveEntity.position[0].toFixed(1)} · y {liveEntity.position[1].toFixed(1)} · z {liveEntity.position[2].toFixed(1)}</div><div className="text-[10px] text-neutral-500">Live world object — edit its source data to move it permanently.</div></div> : null}
              {liveObject !== null ? <div className="mt-3 space-y-1"><div className="text-cyan-200">{liveObject.catalogId}</div><div className="text-neutral-500">live object · {liveObject.instanceId}</div><div className="text-neutral-400">x {liveObject.position[0].toFixed(1)} · y {liveObject.position[1].toFixed(1)} · z {liveObject.position[2].toFixed(1)}</div><div className="text-[10px] text-neutral-500">Live world object — edit its source data to move it permanently.</div></div> : null}
              {selection.length === 0 && liveEntity === null && liveObject === null ? <div className="mt-3 text-neutral-500">Select an authored or live world object, or + Add to place new ones.</div> : null}
            </div>
          </aside>
        ) : null}
      </div>

      {bottomOpen ? (
        <section className="pointer-events-auto flex h-64 min-h-40 max-h-[55vh] resize-y flex-col overflow-hidden border-t border-white/10 bg-neutral-950/95 backdrop-blur">
          <div className="flex items-center border-b border-white/10 px-3 py-2"><div className="font-medium text-neutral-300">Asset browser</div><span className="ml-2 text-neutral-500">{assets.length} assets · Ctrl+B</span><button type="button" className="ml-auto rounded px-2 py-1 text-neutral-400 hover:bg-white/10" onClick={() => setBottomOpen(false)} aria-label="Close asset browser">×</button></div>
          <div className="min-h-0 flex-1 overflow-hidden p-2"><AssetBrowser assets={assets} session={session} onPlace={placeAsset} /></div>
        </section>
      ) : null}
    </div>
  );
}
