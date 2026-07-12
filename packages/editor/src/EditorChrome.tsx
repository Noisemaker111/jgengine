import { useEffect, useMemo, useRef, useState } from "react";

import { listEditorKinds, type EditorSession } from "@jgengine/core/editor/index";
import { useGameContext } from "@jgengine/react/provider";

import { AssetBrowser, type EditorAssetEntry } from "./AssetBrowser";
import type { GizmoMode } from "./SelectionGizmo";
import type { EditorHostApi, EditorPerfSample } from "./session";
import { useF2Chord } from "./useF2Chord";

const PERF_POLL_MS = 500;

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
  selectable: boolean;
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
}): OutlinerGroup[] {
  const byKind = new Map<string, Map<string, OutlinerRow>>();
  const push = (kind: string, label: string, id: string, selectable: boolean) => {
    let labels = byKind.get(kind);
    if (labels === undefined) {
      labels = new Map();
      byKind.set(kind, labels);
    }
    const row = labels.get(label);
    if (row === undefined) labels.set(label, { label, ids: [id], selectable });
    else row.ids.push(id);
  };
  for (const marker of document.markers) push(marker.kind, marker.label ?? marker.id, marker.id, true);
  for (const volume of document.volumes) push(volume.kind, volume.label ?? volume.id, volume.id, true);
  for (const path of document.paths) push(path.kind, path.label ?? path.id, path.id, false);
  return [...byKind.entries()]
    .map(([kind, labels]) => {
      const rows = [...labels.values()];
      return { kind, rows, total: rows.reduce((sum, row) => sum + row.ids.length, 0) };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The editor's HUD chrome: outliner, asset browser, inspector, and toolbar. */
export function EditorChrome({
  gameId,
  session,
  api,
  assets,
  gizmoMode,
  setGizmoMode,
}: {
  gameId: string;
  session: EditorSession;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  gizmoMode: GizmoMode;
  setGizmoMode: (mode: GizmoMode) => void;
}) {
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<"outliner" | "assets">("outliner");
  const [collapsedKinds, setCollapsedKinds] = useState<Record<string, boolean>>({});
  const state = session.getState();
  const visibility = api.getVisibility();
  const perf = usePerfSample(api);

  const outlinerGroups = useMemo(() => buildOutlinerGroups(state.document), [state.document, tick]);
  const outlinerGroupsRef = useRef(outlinerGroups);
  outlinerGroupsRef.current = outlinerGroups;

  const selectRow = (id: string) => {
    session.dispatch({ type: "select", ids: [id] });
    api.handle({ method: "camera_goto", id });
  };

  useF2Chord("KeyE", () => api.setMode("play"));

  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        session.dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        session.dispatch({ type: "redo" });
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        const id = session.getState().selection[0];
        if (id !== undefined) session.dispatch({ type: "remove", id });
      }
      if (event.key === "w" || event.key === "W") setGizmoMode("translate");
      if (event.key === "e" || event.key === "E") setGizmoMode("rotate");
      if (event.key === "r" || event.key === "R") setGizmoMode("scale");
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
  }, [session, setGizmoMode, api]);

  const ctx = useGameContext();
  const kinds = useMemo(() => listEditorKinds(state.document), [state.document, tick]);
  const selectedId = state.selection[0];
  const selectedMarker = state.document.markers.find((marker) => marker.id === selectedId);
  const selectedVolume = state.document.volumes.find((volume) => volume.id === selectedId);
  const documentMiss = selectedId !== undefined && selectedMarker === undefined && selectedVolume === undefined;
  const liveEntity = documentMiss ? ctx.scene.entity.get(selectedId) : null;
  const liveObject = documentMiss && liveEntity === null ? ctx.scene.object.get(selectedId) : null;

  const allKinds = useMemo(
    () => [...new Set([...kinds.markers, ...kinds.volumes, ...kinds.paths])].sort(),
    [kinds],
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

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex text-xs text-neutral-100">
      <aside className="pointer-events-auto flex w-72 flex-col gap-2 border-r border-white/10 bg-neutral-950/90 p-3 backdrop-blur">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300">JGengine Editor</div>
        <div className="text-neutral-400">
          game <span className="text-neutral-100">{gameId}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={() => api.handle({ method: "camera_frame" })}
          >
            Frame all
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={() => session.dispatch({ type: "undo" })}
            disabled={!session.canUndo()}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={() => session.dispatch({ type: "redo" })}
            disabled={!session.canRedo()}
          >
            Redo
          </button>
          <button
            type="button"
            className="rounded bg-cyan-700/80 px-2 py-1 hover:bg-cyan-600"
            onClick={() => downloadText(`${gameId}-editor.json`, session.exportJson(true))}
          >
            Export JSON
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="rounded bg-emerald-700/80 px-2 py-1 hover:bg-emerald-600"
            onClick={() => api.setMode("play")}
          >
            ▶ Play F2+E
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={() => api.setMode("walk")}
          >
            🚶 Walk
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              ["translate", "Move W"],
              ["rotate", "Rotate E"],
              ["scale", "Scale R"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`rounded px-2 py-1 ${gizmoMode === mode ? "bg-cyan-700/80" : "bg-white/10 hover:bg-white/20"}`}
              onClick={() => setGizmoMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-1 font-medium text-neutral-300">Layers</div>
        <div className="max-h-32 space-y-1 overflow-auto pr-1">
          {allKinds.map((kind) => (
            <label key={kind} className="flex cursor-pointer items-center gap-2 text-neutral-300">
              <input
                type="checkbox"
                checked={visibility[kind] !== false}
                onChange={(event) => {
                  api.setVisibility({ ...api.getVisibility(), [kind]: event.target.checked });
                  setTick((value) => value + 1);
                }}
              />
              <span>{kind}</span>
            </label>
          ))}
          {allKinds.length === 0 ? <div className="text-neutral-500">No authored layers</div> : null}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded px-2 py-0.5 ${tab === "outliner" ? "bg-white/20" : "bg-white/5"}`}
            onClick={() => setTab("outliner")}
          >
            Outliner
          </button>
          <button
            type="button"
            className={`rounded px-2 py-0.5 ${tab === "assets" ? "bg-white/20" : "bg-white/5"}`}
            onClick={() => setTab("assets")}
          >
            Assets ({assets.length})
          </button>
        </div>

        {tab === "outliner" ? (
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto pr-1">
            {outlinerGroups.map((group) => {
              const collapsed = collapsedKinds[group.kind] === true;
              return (
                <div key={group.kind}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left font-medium text-neutral-300 hover:bg-white/10"
                    onClick={() =>
                      setCollapsedKinds((previous) => ({ ...previous, [group.kind]: !collapsed }))
                    }
                  >
                    <span className="w-3 text-neutral-500">{collapsed ? "▸" : "▾"}</span>
                    <span>{group.kind}</span>
                    <span className="ml-auto text-neutral-500">{group.total}</span>
                  </button>
                  {collapsed
                    ? null
                    : group.rows.map((row) => {
                        const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                        const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                        return row.selectable ? (
                          <button
                            key={`${group.kind}:${row.label}`}
                            type="button"
                            className={`block w-full truncate rounded py-0.5 pl-5 pr-1.5 text-left ${
                              rowSelected ? "bg-cyan-700/50" : "hover:bg-white/10"
                            }`}
                            onClick={() => selectRow(row.ids[0]!)}
                          >
                            {row.label}
                            {row.ids.length > 1 ? (
                              <span className="text-neutral-500">
                                {" "}
                                ×{row.ids.length}
                                {rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          <div
                            key={`${group.kind}:${row.label}`}
                            className="truncate py-0.5 pl-5 pr-1.5 text-neutral-400"
                          >
                            {row.label}
                            {row.ids.length > 1 ? (
                              <span className="text-neutral-500"> ×{row.ids.length}</span>
                            ) : null}
                          </div>
                        );
                      })}
                </div>
              );
            })}
          </div>
        ) : (
          <AssetBrowser assets={assets} session={session} onPlace={placeAsset} />
        )}
      </aside>

      <div className="pointer-events-none flex flex-1 flex-col">
        <div className="pointer-events-none flex justify-center p-2">
          <div className="flex items-center gap-3 rounded border border-white/10 bg-black/50 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
            <span>Orbit cam · gizmo W/E/R · click select · Ctrl+Z · F2 devtools · F2+E play</span>
            {perf !== null ? (
              <span className={perf.fps < 30 ? "text-rose-400" : "text-emerald-400"}>
                {perf.fps.toFixed(0)} fps · {perf.drawCalls} draws · {formatTriangles(perf.triangles)} tris
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex-1" />
      </div>

      <aside className="pointer-events-auto flex w-72 flex-col border-l border-white/10 bg-neutral-950/90 p-3 backdrop-blur">
        <div className="font-medium text-neutral-300">Inspector</div>
        {selectedMarker !== undefined ? (
          <div className="mt-2 space-y-2">
            <div className="text-cyan-200">{selectedMarker.label ?? selectedMarker.id}</div>
            <div className="text-neutral-500">{selectedMarker.kind}</div>
            {(["x", "y", "z"] as const).map((axis) => (
              <label key={axis} className="flex items-center justify-between gap-2">
                <span className="uppercase text-neutral-500">{axis}</span>
                <input
                  type="number"
                  className="w-28 rounded border border-white/10 bg-black/40 px-1.5 py-0.5"
                  value={selectedMarker.position[axis]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    session.dispatch({
                      type: "setTransform",
                      id: selectedMarker.id,
                      position: { ...selectedMarker.position, [axis]: value },
                    });
                  }}
                />
              </label>
            ))}
            {selectedMarker.meta !== undefined ? (
              <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] text-neutral-400">
                {JSON.stringify(selectedMarker.meta, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
        {selectedVolume !== undefined ? (
          <div className="mt-2 space-y-2">
            <div className="text-cyan-200">{selectedVolume.label ?? selectedVolume.id}</div>
            <div className="text-neutral-500">
              {selectedVolume.kind} · {selectedVolume.shape}
            </div>
            {(["x", "y", "z"] as const).map((axis) => (
              <label key={axis} className="flex items-center justify-between gap-2">
                <span className="uppercase text-neutral-500">{axis}</span>
                <input
                  type="number"
                  className="w-28 rounded border border-white/10 bg-black/40 px-1.5 py-0.5"
                  value={selectedVolume.center[axis]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    session.dispatch({
                      type: "setVolume",
                      id: selectedVolume.id,
                      patch: { center: { ...selectedVolume.center, [axis]: value } },
                    });
                  }}
                />
              </label>
            ))}
            {selectedVolume.radius !== undefined ? (
              <label className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">radius</span>
                <input
                  type="number"
                  className="w-28 rounded border border-white/10 bg-black/40 px-1.5 py-0.5"
                  value={selectedVolume.radius}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { radius: value } });
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        {liveEntity !== null ? (
          <div className="mt-2 space-y-1">
            <div className="text-cyan-200">{liveEntity.name}</div>
            <div className="text-neutral-500">
              live entity · {liveEntity.role} · {liveEntity.id}
            </div>
            <div className="text-neutral-400">
              x {liveEntity.position[0].toFixed(1)} · y {liveEntity.position[1].toFixed(1)} · z{" "}
              {liveEntity.position[2].toFixed(1)}
            </div>
            <div className="text-[10px] text-neutral-500">
              Live world object — spawned by the game, not the editor document. Edit its source data to move it
              permanently.
            </div>
          </div>
        ) : null}
        {liveObject !== null ? (
          <div className="mt-2 space-y-1">
            <div className="text-cyan-200">{liveObject.catalogId}</div>
            <div className="text-neutral-500">live object · {liveObject.instanceId}</div>
            <div className="text-neutral-400">
              x {liveObject.position[0].toFixed(1)} · y {liveObject.position[1].toFixed(1)} · z{" "}
              {liveObject.position[2].toFixed(1)}
            </div>
            <div className="text-[10px] text-neutral-500">
              Live world object — spawned by the game, not the editor document. Edit its source data to move it
              permanently.
            </div>
          </div>
        ) : null}
        {selectedMarker === undefined && selectedVolume === undefined && liveEntity === null && liveObject === null ? (
          <div className="mt-3 text-neutral-500">Click anything in the world to select it.</div>
        ) : null}
        <div className="mt-auto pt-4 text-[10px] text-neutral-500">
          Agent: window.__jgengineEditorHost · MCP: jgengine editor-mcp --stdio
        </div>
      </aside>
    </div>
  );
}
