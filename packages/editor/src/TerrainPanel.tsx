import { useEffect, useState } from "react";

import { editorDocumentBounds } from "@jgengine/core/editor/index";
import type { Aabb } from "@jgengine/core/world/geometry";
import {
  createTerrainSnapshot,
  editableTerrainFromSnapshot,
  type EditableTerrain,
  type SurfaceDelta,
  type TerrainSurfaceRule,
} from "@jgengine/core/world/terraform";

import type { EditorSession } from "./session";
import { TERRAIN_MATERIALS, type EditorUiStore, type TerrainBrushKind } from "./uiStore";
import { INPUT } from "./chromeStyles";
import { SliderRow } from "./chromeFields";

const TERRAIN_BRUSHES: readonly { kind: TerrainBrushKind; label: string; hint: string }[] = [
  { kind: "raise", label: "Raise", hint: "Push terrain up" },
  { kind: "lower", label: "Lower", hint: "Dig terrain down" },
  { kind: "smooth", label: "Smooth", hint: "Average toward neighbors" },
  { kind: "flatten", label: "Flatten", hint: "Level to a target height" },
  { kind: "noise", label: "Noise", hint: "Roughen with fractal detail" },
  { kind: "ramp", label: "Ramp", hint: "Drag a straight grade A→B" },
];

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
export function TerrainPanel({ session, ui }: { session: EditorSession; ui: EditorUiStore }) {
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
