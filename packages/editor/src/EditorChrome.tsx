import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  collectDescendants,
  editorChildren,
  editorDocumentSize,
  editorParentOf,
  editorRoots,
  extractEditorFragment,
  findEditorNote,
  findEditorPath,
  listEditorKinds,
  WELL_KNOWN_MARKER_KINDS,
  type EditorDocument,
  type EditorPath,
  type EditorSession,
  type EditorVolume,
} from "@jgengine/core/editor/index";
import {
  readVegetationSettings,
  vegetationFootprint,
  VEGETATION_VOLUME_KIND,
} from "@jgengine/core/world/vegetation";
import { editorDocumentBounds } from "@jgengine/core/editor/index";
import type { Aabb } from "@jgengine/core/world/geometry";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  type EditableTerrain,
  type SurfaceDelta,
  type TerrainSurfaceRule,
} from "@jgengine/core/world/terraform";
import {
  readScatterPalette,
  readScatterRules,
  scatterRegionEstimate,
  SCATTER_PATH_KIND,
  type ScatterPaletteEntry,
} from "@jgengine/core/world/scatterRegion";
import { useGameContext } from "@jgengine/react/provider";

import { AssetBrowser, type EditorAssetEntry } from "./AssetBrowser";
import type { EditorHostApi, EditorPerfSample } from "./session";
import { TERRAIN_MATERIALS, type EditorUiStore, type PlacementTool, type SnapMode, type TerrainBrushKind } from "./uiStore";
import { useF2Chord } from "./useF2Chord";

const PERF_POLL_MS = 500;

const BTN =
  "rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10 hover:text-neutral-100";
const INPUT =
  "rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-400/60 focus:bg-black/60";
const MICRO = "text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500";

type WorkspacePanel = "outliner" | "assets";

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

interface HierarchyRow {
  id: string;
  label: string;
  kind: string;
  depth: number;
  hasChildren: boolean;
}

/** Builds a flat list of hierarchy rows (roots then nested children) honoring collapsed nodes. */
function flattenHierarchy(document: EditorDocument, collapsed: Record<string, boolean>): HierarchyRow[] {
  const label = new Map<string, { label: string; kind: string }>();
  for (const marker of document.markers) label.set(marker.id, { label: marker.label ?? marker.id, kind: marker.kind });
  for (const volume of document.volumes) label.set(volume.id, { label: volume.label ?? volume.id, kind: volume.kind });
  for (const path of document.paths) label.set(path.id, { label: path.label ?? path.id, kind: path.kind });
  for (const note of document.annotations) label.set(note.id, { label: note.text.slice(0, 40) || note.id, kind: "note" });

  const rows: HierarchyRow[] = [];
  const visit = (id: string, depth: number) => {
    const info = label.get(id) ?? { label: id, kind: "?" };
    const children = editorChildren(document, id).sort((a, b) => (label.get(a)?.label ?? a).localeCompare(label.get(b)?.label ?? b));
    rows.push({ id, label: info.label, kind: info.kind, depth, hasChildren: children.length > 0 });
    if (collapsed[id] === true) return;
    for (const child of children) visit(child, depth + 1);
  };
  for (const root of editorRoots(document)) visit(root, 0);
  return rows;
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
      <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type="number"
        step={step}
        className={`w-32 ${INPUT}`}
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

function VegetationFields({
  volume,
  onMeta,
}: {
  volume: EditorVolume;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
}) {
  const settings = readVegetationSettings(volume);
  if (settings === null) return null;
  const footprint = vegetationFootprint(volume);
  const areaM2 = (footprint.maxX - footprint.minX) * (footprint.maxZ - footprint.minZ);
  const sliderMax = settings.item === "grass" ? 12 : 1;
  const estimated = Math.floor(areaM2 * settings.density);
  return (
    <div className="space-y-2 rounded-lg border border-emerald-400/15 bg-emerald-500/[0.06] p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Vegetation</div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">item</span>
        <input
          className={`w-32 ${INPUT}`}
          value={settings.item}
          placeholder="grass"
          onChange={(event) => onMeta({ item: event.target.value }, "veg:item")}
        />
      </label>
      <label className="block space-y-1">
        <span className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">density /m²</span>
          <span className="text-cyan-200">{settings.density.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderMax / 200}
          className="w-full accent-emerald-400"
          value={Math.min(settings.density, sliderMax)}
          onChange={(event) => onMeta({ density: Number(event.target.value) }, "veg:density")}
        />
      </label>
      <NumberField label="density" step={0.01} value={settings.density} onCommit={(value) => onMeta({ density: Math.max(0, value) }, "veg:density")} />
      <NumberField label="min scale" step={0.05} value={settings.minScale} onCommit={(value) => onMeta({ minScale: value }, "veg:minScale")} />
      <NumberField label="max scale" step={0.05} value={settings.maxScale} onCommit={(value) => onMeta({ maxScale: value }, "veg:maxScale")} />
      <NumberField label="spacing" step={0.25} value={settings.minDistance} onCommit={(value) => onMeta({ minDistance: Math.max(0, value) }, "veg:minDistance")} />
      <label className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">seed</span>
        <input
          className={`w-32 ${INPUT}`}
          value={settings.seed}
          placeholder="reroll…"
          onChange={(event) => onMeta({ seed: event.target.value }, "veg:seed")}
        />
      </label>
      <div className="text-[10px] text-neutral-500">≈ {estimated.toLocaleString()} {settings.item === "grass" ? "blades" : "placements"} over {Math.round(areaM2).toLocaleString()} m²</div>
    </div>
  );
}

const TERRAIN_BRUSHES: readonly { kind: TerrainBrushKind; label: string; hint: string }[] = [
  { kind: "raise", label: "Raise", hint: "Push terrain up" },
  { kind: "lower", label: "Lower", hint: "Dig terrain down" },
  { kind: "smooth", label: "Smooth", hint: "Average toward neighbors" },
  { kind: "flatten", label: "Flatten", hint: "Level to a target height" },
  { kind: "noise", label: "Noise", hint: "Roughen with fractal detail" },
  { kind: "ramp", label: "Ramp", hint: "Drag a straight grade A→B" },
];

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className="text-cyan-200">{format ? format(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-400"
      />
    </label>
  );
}

/** Sensible sculpt area when none is authored yet: the document footprint padded, or a 200m square. */
function defaultTerrainBounds(document: Parameters<typeof editorDocumentBounds>[0]): Aabb {
  const bounds = editorDocumentBounds(document);
  if (bounds === null) return { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };
  const pad = 40;
  const minX = bounds.min.x - pad;
  const minZ = bounds.min.z - pad;
  const maxX = bounds.max.x + pad;
  const maxZ = bounds.max.z + pad;
  const span = Math.max(80, Math.min(400, Math.max(maxX - minX, maxZ - minZ)));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return { minX: cx - span / 2, minZ: cz - span / 2, maxX: cx + span / 2, maxZ: cz + span / 2 };
}

function SculptControls({ ui }: { ui: EditorUiStore }) {
  const sculpt = ui.getState().sculpt;
  return (
    <>
      <div className="grid grid-cols-3 gap-1">
        {TERRAIN_BRUSHES.map((brush) => (
          <button
            key={brush.kind}
            type="button"
            title={brush.hint}
            className={`rounded-md px-1.5 py-1 text-[11px] transition-colors ${sculpt.brush === brush.kind ? "bg-amber-500/90 text-white shadow-sm shadow-amber-950/50" : "bg-white/[0.04] text-neutral-300 ring-1 ring-inset ring-white/[0.06] hover:bg-white/10"}`}
            onClick={() => ui.patchSculpt({ brush: brush.kind })}
          >
            {brush.label}
          </button>
        ))}
      </div>
      {sculpt.brush === "ramp" ? <div className="text-[10px] text-neutral-500">Drag from the low end to the high end to grade a slope.</div> : null}
      <SliderRow label="radius" value={sculpt.radius} min={1} max={60} step={0.5} onChange={(value) => ui.patchSculpt({ radius: value })} format={(v) => `${v.toFixed(1)}m`} />
      <SliderRow label="strength" value={sculpt.strength} min={0.05} max={5} step={0.05} onChange={(value) => ui.patchSculpt({ strength: value })} />
      <SliderRow label="spacing" value={sculpt.spacing} min={0.25} max={12} step={0.25} onChange={(value) => ui.patchSculpt({ spacing: value })} format={(v) => `${v.toFixed(2)}m`} />
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">falloff</span>
        <div className="ml-auto flex gap-0.5 rounded-md bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
          {(["smooth", "linear", "none"] as const).map((mode) => (
            <button key={mode} type="button" className={`rounded px-1.5 py-0.5 text-[10px] capitalize transition-colors ${sculpt.falloff === mode ? "bg-amber-500/80 text-white" : "text-neutral-400 hover:text-neutral-200"}`} onClick={() => ui.patchSculpt({ falloff: mode })}>{mode}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">shape</span>
        <button type="button" className="ml-auto rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] capitalize ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" onClick={() => ui.patchSculpt({ shape: sculpt.shape === "circle" ? "square" : "circle" })}>{sculpt.shape}</button>
        <label className="flex items-center gap-1 text-[10px] text-neutral-400">
          <input type="checkbox" className="accent-amber-400" checked={sculpt.invert} onChange={(event) => ui.patchSculpt({ invert: event.target.checked })} />
          invert
        </label>
      </div>
      {sculpt.brush === "flatten" ? (
        <label className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">flatten to</span>
          <input type="number" step={0.5} placeholder="sample" className={`w-24 ${INPUT}`} value={sculpt.flattenHeight ?? ""} onChange={(event) => ui.patchSculpt({ flattenHeight: event.target.value === "" ? null : Number(event.target.value) })} />
        </label>
      ) : null}
      {sculpt.brush === "noise" ? (
        <label className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">seed</span>
          <input type="number" step={1} className={`w-24 ${INPUT}`} value={sculpt.noiseSeed} onChange={(event) => ui.patchSculpt({ noiseSeed: Math.round(Number(event.target.value)) || 0 })} />
        </label>
      ) : null}
    </>
  );
}

function PaintControls({ session, ui }: { session: EditorSession; ui: EditorUiStore }) {
  const paint = ui.getState().paint;
  const document = session.getState().document;

  const paintDelta = (build: (terrain: EditableTerrain) => SurfaceDelta) => {
    if (document.terrain === undefined) return;
    const delta = build(editableTerrainFromSnapshot(document.terrain));
    if (delta.indices.length > 0) session.dispatch({ type: "paintTerrain", delta });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        {TERRAIN_MATERIALS.map((material) => (
          <button
            key={material.id}
            type="button"
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] transition-colors ${paint.material === material.id ? "bg-amber-500/90 text-white shadow-sm shadow-amber-950/50" : "bg-white/[0.04] text-neutral-300 ring-1 ring-inset ring-white/[0.06] hover:bg-white/10"}`}
            onClick={() => ui.patchPaint({ material: material.id })}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-inset ring-black/40" style={{ backgroundColor: material.color }} />
            {material.label}
          </button>
        ))}
      </div>
      <div className="text-[10px] text-neutral-500">Click/drag to paint · Alt-click to sample.</div>
      <SliderRow label="radius" value={paint.radius} min={1} max={60} step={0.5} onChange={(value) => ui.patchPaint({ radius: value })} format={(v) => `${v.toFixed(1)}m`} />
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">shape</span>
        <button type="button" className="ml-auto rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] capitalize ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" onClick={() => ui.patchPaint({ shape: paint.shape === "circle" ? "square" : "circle" })}>{paint.shape}</button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" onClick={() => paintDelta((terrain) => terrain.fillSurfaceDelta(paint.material))}>Fill all</button>
        <button type="button" className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" onClick={() => paintDelta((terrain) => terrain.fillSurfaceDelta(null))}>Clear paint</button>
      </div>
      <div className="space-y-1 rounded-lg border border-white/[0.06] p-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Auto rules</div>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" title="Paint the selected material onto slopes steeper than ~30°" onClick={() => paintDelta((terrain) => terrain.autoPaintDelta({ surface: paint.material, minSlope: 0.6 } satisfies TerrainSurfaceRule))}>On steep slopes</button>
          <button type="button" className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" title="Paint the selected material above height 15" onClick={() => paintDelta((terrain) => terrain.autoPaintDelta({ surface: paint.material, minHeight: 15 } satisfies TerrainSurfaceRule))}>On high ground</button>
        </div>
      </div>
    </>
  );
}

/** The terrain-tool panel: create/clear the heightfield and drive the sculpt/paint controls. */
function TerrainPanel({ session, ui }: { session: EditorSession; ui: EditorUiStore }) {
  const [, setTick] = useState(0);
  useEffect(() => ui.subscribe(() => setTick((value) => value + 1)), [ui]);
  useEffect(() => session.subscribe(() => setTick((value) => value + 1)), [session]);
  const uiState = ui.getState();
  const document = session.getState().document;
  const hasTerrain = document.terrain !== undefined;

  const createTerrain = () => {
    session.dispatch({ type: "setTerrain", terrain: createTerrainSnapshot({ bounds: defaultTerrainBounds(document), cellSize: 2 }) });
  };

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-40 max-h-[calc(100%-1.5rem)] w-64 space-y-2.5 overflow-auto rounded-xl border border-amber-400/20 bg-[#0d0f13]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-md">
      <div className="flex items-center">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">Terrain</div>
        <button type="button" className="ml-auto rounded-md px-2 py-0.5 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => ui.setTool("select")} title="Back to select tool">×</button>
      </div>
      {!hasTerrain ? (
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-neutral-400">No terrain yet. Create an editable heightfield over the scene, then sculpt its shape and paint material layers on it.</p>
          <button type="button" className="w-full rounded-md bg-gradient-to-b from-amber-500 to-amber-600 px-2.5 py-1.5 font-semibold text-white shadow-md shadow-amber-950/50 transition-colors hover:from-amber-400 hover:to-amber-500" onClick={createTerrain}>Create terrain</button>
        </div>
      ) : (
        <>
          <div className="flex gap-0.5 rounded-lg bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
            {(["sculpt", "paint"] as const).map((mode) => (
              <button key={mode} type="button" className={`flex-1 rounded-md px-2 py-1 text-[11px] capitalize transition-colors ${uiState.terrainMode === mode ? "bg-amber-500/90 text-white shadow-sm shadow-amber-950/50" : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"}`} onClick={() => ui.setTerrainMode(mode)}>{mode}</button>
            ))}
          </div>
          {uiState.terrainMode === "paint" ? <PaintControls session={session} ui={ui} /> : <SculptControls ui={ui} />}
          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
            <button type="button" className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10 disabled:opacity-40" onClick={() => session.dispatch({ type: "undo" })} disabled={!session.canUndo()}>Undo</button>
            <button type="button" className="rounded-md bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200 ring-1 ring-inset ring-rose-400/25 transition-colors hover:bg-rose-500/25" onClick={() => session.dispatch({ type: "clearTerrain" })}>Clear terrain</button>
          </div>
        </>
      )}
    </div>
  );
}

function ScatterFields({
  path,
  onMeta,
}: {
  path: EditorPath;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
}) {
  const rules = readScatterRules(path);
  if (rules === null) return null;
  const palette = readScatterPalette(path.meta);
  const estimate = scatterRegionEstimate(path);
  const setPalette = (next: ScatterPaletteEntry[]) => onMeta({ palette: next, item: "" }, "scatter:palette");
  return (
    <div className="space-y-2 rounded-lg border border-emerald-400/15 bg-emerald-500/[0.06] p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Foliage / scatter</div>
      {path.points.length < 3 ? <div className="text-[10px] text-amber-300">Draw at least 3 points to close the region.</div> : null}
      <label className="block space-y-1">
        <span className="flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">density /m²</span>
          <span className="text-cyan-200">{rules.density.toFixed(2)}</span>
        </span>
        <input type="range" min={0} max={2} step={0.01} className="w-full accent-emerald-400" value={Math.min(rules.density, 2)} onChange={(event) => onMeta({ density: Number(event.target.value) }, "scatter:density")} />
      </label>
      <NumberField label="density" step={0.01} value={rules.density} onCommit={(value) => onMeta({ density: Math.max(0, value) }, "scatter:density")} />
      <NumberField label="spacing" step={0.25} value={rules.minSpacing} onCommit={(value) => onMeta({ minSpacing: Math.max(0, value) }, "scatter:minSpacing")} />
      <NumberField label="min scale" step={0.05} value={rules.minScale} onCommit={(value) => onMeta({ minScale: value }, "scatter:minScale")} />
      <NumberField label="max scale" step={0.05} value={rules.maxScale} onCommit={(value) => onMeta({ maxScale: value }, "scatter:maxScale")} />
      <NumberField label="max slope" step={0.05} value={rules.maxSlope} onCommit={(value) => onMeta({ maxSlope: Math.max(0, value) }, "scatter:maxSlope")} />
      <NumberField label="edge fade" step={0.5} value={rules.edgeFalloff} onCommit={(value) => onMeta({ edgeFalloff: Math.max(0, value) }, "scatter:edgeFalloff")} />
      <label className="flex items-center gap-1.5 text-[10px] text-neutral-400">
        <input type="checkbox" className="accent-emerald-400" checked={rules.alignToNormal} onChange={(event) => onMeta({ alignToNormal: event.target.checked }, "scatter:align")} />
        align to slope
      </label>
      <div className="space-y-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">species (weighted)</div>
        {palette.map((entry, index) => (
          <div key={index} className="flex items-center gap-1">
            <input className={`min-w-0 flex-1 ${INPUT}`} value={entry.item} placeholder="grass / tree id" onChange={(event) => setPalette(palette.map((e, i) => (i === index ? { ...e, item: event.target.value } : e)))} />
            <input type="number" step={1} min={0} className={`w-14 ${INPUT}`} value={entry.weight} onChange={(event) => setPalette(palette.map((e, i) => (i === index ? { ...e, weight: Math.max(0, Number(event.target.value)) } : e)))} />
            <button type="button" className="rounded-md bg-white/[0.04] px-1.5 py-1 text-neutral-400 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-rose-500/20 hover:text-rose-200" disabled={palette.length <= 1} onClick={() => setPalette(palette.filter((_, i) => i !== index))}>×</button>
          </div>
        ))}
        <button type="button" className="w-full rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" onClick={() => setPalette([...palette, { item: "tree", weight: 1 }])}>+ species</button>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">seed</span>
          <input className={`w-full min-w-0 ${INPUT}`} value={rules.seed} placeholder="reroll…" onChange={(event) => onMeta({ seed: event.target.value }, "scatter:seed")} />
        </label>
        <button type="button" className="shrink-0 rounded-md bg-white/[0.04] px-2 py-1 text-neutral-300 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" title="Reroll seed" onClick={() => onMeta({ seed: `r${path.points.length}${rules.seed.length}${Math.round(rules.density * 1000)}` }, "scatter:seed")}>⟳</button>
      </div>
      <div className="text-[10px] text-neutral-500">≈ {estimate.count.toLocaleString()} placements over {Math.round(estimate.area).toLocaleString()} m²</div>
    </div>
  );
}

/** Inspector row to parent the selected object under another (excludes itself and its descendants). */
function ParentField({ session, id }: { session: EditorSession; id: string }) {
  const document = session.getState().document;
  const current = editorParentOf(document, id) ?? "";
  const banned = collectDescendants(document, [id]);
  banned.add(id);
  const labelOf = (node: { id: string; label?: string }) => node.label ?? node.id;
  const candidates = [
    ...document.markers.map((m) => ({ id: m.id, label: labelOf(m) })),
    ...document.volumes.map((v) => ({ id: v.id, label: labelOf(v) })),
    ...document.paths.map((p) => ({ id: p.id, label: labelOf(p) })),
    ...document.annotations.map((n) => ({ id: n.id, label: n.text.slice(0, 30) || n.id })),
  ].filter((entry) => !banned.has(entry.id));
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">parent</span>
      <select
        className={`w-40 ${INPUT}`}
        value={current}
        onChange={(event) => session.dispatch({ type: "setParent", ids: [id], parentId: event.target.value === "" ? null : event.target.value })}
      >
        <option value="">— none (root) —</option>
        {candidates.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>
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
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">kind</span>
        <input
          className={`w-full min-w-0 ${INPUT}`}
          value={kind}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (next.length > 0) onKind(next);
          }}
        />
      </label>
      <input
        type="color"
        className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-white/10 bg-black/40"
        title="Display color"
        value={color ?? "#ffffff"}
        onChange={(event) => onColor(event.target.value)}
      />
      {color !== undefined ? (
        <button type="button" className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-1 text-neutral-400 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/10" title="Reset to kind default color" onClick={() => onColor(undefined)}>↺</button>
      ) : null}
    </div>
  );
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

/** The editor's dockable workspace chrome: hierarchy, assets, inspector, toolbar, and save. */
export function EditorChrome({
  gameId,
  session,
  api,
  assets,
  ui,
  baselineJson,
  save,
}: {
  gameId: string;
  session: EditorSession;
  api: EditorHostApi;
  assets: readonly EditorAssetEntry[];
  ui: EditorUiStore;
  baselineJson?: string;
  save?: (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
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
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [outlinerView, setOutlinerView] = useState<"kind" | "tree">("kind");
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
              <div className={`px-2 pb-1 pt-2 ${MICRO}`}>Other</div>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "path", kind: "route" })}>Draw path (route)</button>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-neutral-300 transition-colors hover:bg-cyan-500/15 hover:text-cyan-100" onClick={() => startPlacement({ tool: "path", kind: "road" })}>Draw road</button>
              <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-emerald-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-100" onClick={() => startPlacement({ tool: "path", kind: SCATTER_PATH_KIND })}>Foliage region (lasso)</button>
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
        <div className="h-5 w-px bg-white/[0.07]" />
        <button type="button" className={BTN} onClick={() => api.handle({ method: "camera_frame" })}>Frame all</button>
        <button type="button" className={`${BTN} disabled:opacity-40`} onClick={() => session.dispatch({ type: "undo" })} disabled={!session.canUndo()}>Undo</button>
        <button type="button" className={`${BTN} disabled:opacity-40`} onClick={() => session.dispatch({ type: "redo" })} disabled={!session.canRedo()}>Redo</button>
        <button type="button" className={BTN} onClick={() => showPanel("assets")}>Assets</button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={BTN} onClick={() => setRightOpen((value) => !value)}>Inspector</button>
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
              <button type="button" className="rounded-md px-2 py-1 text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200" onClick={() => showPanel("assets")}>Assets {assets.length}</button>
              <button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setLeftOpen(false)} aria-label="Close hierarchy panel">×</button>
            </div>
            <div className="space-y-1.5 border-b border-white/[0.08] p-2">
              <input type="search" value={outlinerQuery} onChange={(event) => setOutlinerQuery(event.target.value)} placeholder="Search objects and kinds…" className={`w-full ${INPUT} px-2.5 py-1.5`} />
              <div className="flex gap-0.5 rounded-md bg-black/40 p-0.5 ring-1 ring-inset ring-white/[0.06]">
                {(["kind", "tree"] as const).map((view) => (
                  <button key={view} type="button" className={`flex-1 rounded px-2 py-0.5 text-[10px] capitalize transition-colors ${outlinerView === view ? "bg-cyan-500/80 text-white" : "text-neutral-400 hover:text-neutral-200"}`} onClick={() => setOutlinerView(view)}>{view === "kind" ? "By kind" : "Tree"}</button>
                ))}
              </div>
            </div>
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
            <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
              {outlinerView === "tree" ? (
                <>
                  {flattenHierarchy(state.document, collapsedNodes).map((node) => {
                    const rowSelected = selection.includes(node.id);
                    return (
                      <div key={node.id} className="flex items-center" style={{ paddingLeft: `${node.depth * 12}px` }}>
                        {node.hasChildren ? (
                          <button type="button" className="w-4 shrink-0 text-neutral-500 transition-colors hover:text-neutral-200" onClick={() => setCollapsedNodes((previous) => ({ ...previous, [node.id]: !(previous[node.id] === true) }))}>{collapsedNodes[node.id] === true ? "▸" : "▾"}</button>
                        ) : <span className="w-4 shrink-0" />}
                        <button type="button" className={`flex-1 truncate rounded-md px-1.5 py-1 text-left transition-colors ${rowSelected ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/20" : "text-neutral-300 hover:bg-white/[0.06]"}`} onClick={(event) => selectRow(node.id, event.ctrlKey || event.metaKey || event.shiftKey)} title={node.id}>
                          {node.label}<span className="ml-1 text-[9px] text-neutral-600">{node.kind}</span>
                        </button>
                      </div>
                    );
                  })}
                  {state.document.markers.length + state.document.volumes.length + state.document.paths.length + state.document.annotations.length === 0 ? <div className="p-3 text-center text-neutral-600">No objects yet</div> : null}
                </>
              ) : (
              visibleOutlinerGroups.map((group) => {
                const collapsed = collapsedKinds[group.kind] === true;
                return (
                  <div key={group.kind}>
                    <button type="button" className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left font-semibold text-neutral-300 transition-colors hover:bg-white/[0.06]" onClick={() => setCollapsedKinds((previous) => ({ ...previous, [group.kind]: !collapsed }))}>
                      <span className="w-3 text-neutral-500">{collapsed ? "▸" : "▾"}</span><span>{group.kind}</span><span className="ml-auto text-neutral-500">{group.total}</span>
                    </button>
                    {collapsed ? null : group.rows.map((row) => {
                      const rowSelected = selectedId !== undefined && row.ids.includes(selectedId);
                      const cycleIndex = rowSelected ? row.ids.indexOf(selectedId) + 1 : 0;
                      return (
                        <button key={`${group.kind}:${row.label}`} type="button" className={`block w-full truncate rounded-md py-1 pl-5 pr-1.5 text-left transition-colors ${rowSelected ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/20" : "text-neutral-300 hover:bg-white/[0.06]"}`} onClick={(event) => selectRow(row.ids[0]!, event.ctrlKey || event.metaKey || event.shiftKey)}>
                          {row.label}{row.ids.length > 1 ? <span className="text-neutral-500"> ×{row.ids.length}{rowSelected ? ` · ${cycleIndex}/${row.ids.length} · N next` : ""}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })
              )}
              {outlinerView === "kind" && visibleOutlinerGroups.length === 0 ? <div className="p-3 text-center text-neutral-600">No matching objects</div> : null}
            </div>
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
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/[0.08] bg-black/70 px-4 py-1.5 text-[11px] text-neutral-400 shadow-lg shadow-black/40 backdrop-blur-md">
            <span>Orbit · click select · W/E/R transform · Ctrl+C/V copy/paste · F frame · ? help · F2+E play</span>
            {perf !== null ? <span className={`ml-3 ${perf.fps < 30 ? "text-rose-400" : "text-emerald-400"}`}>{perf.fps.toFixed(0)} fps · {perf.drawCalls} draws · {formatTriangles(perf.triangles)} tris</span> : null}
          </div>
        </main>

        {rightOpen ? (
          <aside className="pointer-events-auto flex w-72 min-w-56 max-w-[42vw] resize-x flex-col overflow-auto border-l border-white/[0.08] bg-[#0d0f13]/95 p-3 backdrop-blur-md" style={{ direction: "rtl" }}>
            <div className="flex-1" style={{ direction: "ltr" }}>
              <div className="flex items-center"><div className={MICRO}>Inspector</div><button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setRightOpen(false)} aria-label="Close inspector panel">×</button></div>
              {selection.length > 1 ? (
                <div className="mt-3 space-y-2">
                  <div className="text-cyan-200">{selection.length} objects selected</div>
                  <div className="max-h-32 space-y-0.5 overflow-auto text-neutral-500">
                    {selection.map((id) => <div key={id} className="truncate">{id}</div>)}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15" onClick={() => session.dispatch({ type: "duplicate", ids: selection })}>Duplicate</button>
                    <button type="button" className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-200 ring-1 ring-inset ring-rose-400/25 transition-colors hover:bg-rose-500/25" onClick={() => session.dispatch({ type: "removeMany", ids: selection })}>Delete all</button>
                  </div>
                </div>
              ) : null}
              {selection.length <= 1 && selectedMarker !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className={`w-full ${INPUT} font-medium text-cyan-200`} value={selectedMarker.label ?? ""} placeholder={selectedMarker.id} onChange={(event) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedMarker.id}` })} />
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
                  <ParentField session={session} id={selectedMarker.id} />
                  {selectedMarker.meta !== undefined ? <pre className="max-h-48 overflow-auto rounded-md border border-white/[0.06] bg-black/40 p-2 text-[10px] text-neutral-400">{JSON.stringify(selectedMarker.meta, null, 2)}</pre> : null}
                </div>
              ) : null}
              {selection.length <= 1 && selectedVolume !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className={`w-full ${INPUT} font-medium text-cyan-200`} value={selectedVolume.label ?? ""} placeholder={selectedVolume.id} onChange={(event) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedVolume.id}` })} />
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
                  <ParentField session={session} id={selectedVolume.id} />
                  <VegetationFields
                    volume={selectedVolume}
                    onMeta={(patch, coalesce) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { meta: { ...selectedVolume.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedVolume.id}` })}
                  />
                </div>
              ) : null}
              {selection.length <= 1 && selectedPath !== undefined ? (
                <div className="mt-3 space-y-2">
                  <input className={`w-full ${INPUT} font-medium text-cyan-200`} value={selectedPath.label ?? ""} placeholder={selectedPath.id} onChange={(event) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { label: event.target.value } }, { coalesce: `label:${selectedPath.id}` })} />
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
                        <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15" onClick={() => { const at = uiState.pathPoint!.index; const points = [...selectedPath.points.slice(0, at + 1), { ...selectedPath.points[at]! }, ...selectedPath.points.slice(at + 1)]; session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Insert point</button>
                        <button type="button" className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-200 ring-1 ring-inset ring-rose-400/25 transition-colors hover:bg-rose-500/25 disabled:opacity-40" disabled={selectedPath.points.length <= 2} onClick={() => { const points = selectedPath.points.filter((_, index) => index !== uiState.pathPoint!.index); ui.patch({ pathPoint: null }); session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Delete point</button>
                      </div>
                    </div>
                  ) : <div className="text-[10px] text-neutral-500">Click a vertex sphere to edit points.</div>}
                  {selectedPath.kind === SCATTER_PATH_KIND ? (
                    <ScatterFields
                      path={selectedPath}
                      onMeta={(patch, coalesce) => session.dispatch({ type: "setPath", id: selectedPath.id, patch: { meta: { ...selectedPath.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedPath.id}` })}
                    />
                  ) : null}
                  <ParentField session={session} id={selectedPath.id} />
                </div>
              ) : null}
              {selection.length <= 1 && selectedNote !== undefined ? (
                <div className="mt-3 space-y-2">
                  <div className="text-neutral-500">note · {selectedNote.id}</div>
                  <textarea className={`h-24 w-full ${INPUT} text-neutral-100`} value={selectedNote.text} onChange={(event) => session.dispatch({ type: "setNote", id: selectedNote.id, patch: { text: event.target.value } }, { coalesce: `text:${selectedNote.id}` })} />
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
        <section className="pointer-events-auto flex h-64 min-h-40 max-h-[55vh] resize-y flex-col overflow-hidden border-t border-white/[0.08] bg-[#0d0f13]/95 backdrop-blur-md">
          <div className="flex items-center border-b border-white/[0.08] px-3 py-2"><div className={MICRO}>Asset browser</div><span className="ml-2 text-neutral-600">{assets.length} assets · Ctrl+B</span><button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={() => setBottomOpen(false)} aria-label="Close asset browser">×</button></div>
          <div className="min-h-0 flex-1 overflow-hidden p-2"><AssetBrowser assets={assets} session={session} onPlace={placeAsset} /></div>
        </section>
      ) : null}
    </div>
  );
}
