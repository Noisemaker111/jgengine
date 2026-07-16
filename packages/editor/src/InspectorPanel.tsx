import {
  collectDescendants,
  editorParentOf,
  findEditorNote,
  findEditorPath,
  type EditorPath,
  type EditorSession,
  type EditorVolume,
} from "@jgengine/core/editor/index";
import { readVegetationSettings, vegetationFootprint } from "@jgengine/core/world/vegetation";
import {
  getSceneKind,
  isSceneKind,
  parseParams,
  type SceneKindObject,
} from "@jgengine/core/scene/sceneKinds";
import { getAssetGenerator } from "@jgengine/core/scene/assetGenerator";
import { useGameContext } from "@jgengine/react/provider";

import { SchemaInspector, type MetaPatch } from "./SchemaInspector";
import { TriggerInspector } from "./TriggerInspector";
import type { EditorUiStore } from "./uiStore";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";
import { INPUT, MICRO } from "./chromeStyles";
import { NumberField } from "./chromeFields";

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

/** Builds the resolver-facing view of a document object for a registered scene kind's inspector. */
function markerObject(marker: { id: string; kind: string; position: { x: number; y: number; z: number }; rotationY?: number; meta?: Record<string, unknown> }): SceneKindObject {
  return { id: marker.id, kind: marker.kind, position: marker.position, ...(marker.rotationY === undefined ? {} : { rotationY: marker.rotationY }), ...(marker.meta === undefined ? {} : { meta: marker.meta }) };
}

function volumeObject(volume: EditorVolume): SceneKindObject {
  return {
    id: volume.id,
    kind: volume.kind,
    center: volume.center,
    ...(volume.halfExtents === undefined ? {} : { halfExtents: volume.halfExtents }),
    ...(volume.radius === undefined ? {} : { radius: volume.radius }),
    ...(volume.meta === undefined ? {} : { meta: volume.meta }),
  };
}

function pathObject(path: EditorPath): SceneKindObject {
  return { id: path.id, kind: path.kind, points: path.points.map((point) => ({ x: point.x, y: point.y, z: point.z })), ...(path.meta === undefined ? {} : { meta: path.meta }) };
}

/** Auto-generated inspector for a registered scene kind's params (schema-driven, no per-kind JSX). */
function KindInspector({ object, meta, onMeta }: { object: SceneKindObject; meta: Record<string, unknown> | undefined; onMeta: MetaPatch }) {
  const definition = getSceneKind(object.kind);
  if (definition === undefined) return null;
  const note = definition.note?.(object, parseParams(definition.schema, object.meta));
  return (
    <SchemaInspector
      schema={definition.schema}
      label={definition.label}
      meta={meta}
      onMeta={onMeta}
      {...(definition.accent === undefined ? {} : { accent: definition.accent })}
      {...(note === undefined ? {} : { note })}
    />
  );
}

/** Auto-generated inspector for a placed generator asset's params (building/bookcase/…). */
function GeneratorInspector({ meta, onMeta }: { meta: Record<string, unknown> | undefined; onMeta: MetaPatch }) {
  const assetId = typeof meta?.["assetId"] === "string" ? (meta["assetId"] as string) : undefined;
  const generator = assetId === undefined ? undefined : getAssetGenerator(assetId);
  if (generator === undefined) return null;
  return <SchemaInspector schema={generator.schema} label={`${generator.label} (generator)`} accent="#a78bfa" meta={meta} onMeta={onMeta} />;
}

/**
 * Tags an object as a gameplay spot with a clearance radius: scatter keeps foliage off it and the
 * runtime ground flattens under it (via `clearanceZonesFrom` → `environment({ clearings })`). 0 = untagged.
 */
function ClearanceField({
  meta,
  onMeta,
}: {
  meta: Record<string, unknown> | undefined;
  onMeta: (patch: Record<string, unknown>, coalesce: string) => void;
}) {
  const value = typeof meta?.["clearance"] === "number" ? (meta["clearance"] as number) : 0;
  return (
    <div className="space-y-1" title="Radius (m) foliage stays clear of and terrain flattens under; 0 = no clearance">
      <NumberField label="clearance m" step={0.5} value={value} onCommit={(next) => onMeta({ clearance: Math.max(0, next) }, "clearance")} />
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

/**
 * The right-hand inspector as an isolated, selector-subscribed panel. It reads only the
 * document + selection slices (via `useStoreSelector`) and the ui store's `pathPoint` slice, so
 * UI-only churn (gizmo mode, snapping, active tool) or unrelated document edits outside the
 * selected object's slice no longer rerender it on `EditorChrome`'s own render tick.
 * @internal — mounted by `EditorChrome` as a right-aside panel.
 */
export function InspectorPanel({ session, ui, onClose }: { session: EditorSession; ui: EditorUiStore; onClose: () => void }) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const pathPoint = useStoreSelector(ui, (state) => state.pathPoint);
  const ctx = useGameContext();

  const selectedId = selection[0];
  const selectedMarker = document.markers.find((marker) => marker.id === selectedId);
  const selectedVolume = document.volumes.find((volume) => volume.id === selectedId);
  const selectedPath = selectedId === undefined ? undefined : findEditorPath(document, selectedId);
  const selectedNote = selectedId === undefined ? undefined : findEditorNote(document, selectedId);
  const documentMiss =
    selectedId !== undefined &&
    selectedMarker === undefined &&
    selectedVolume === undefined &&
    selectedPath === undefined &&
    selectedNote === undefined;
  const liveEntity = documentMiss ? ctx.scene.entity.get(selectedId) : null;
  const liveObject = documentMiss && liveEntity === null ? ctx.scene.object.get(selectedId) : null;

  return (
    <aside className="pointer-events-auto flex w-72 min-w-56 max-w-[42vw] resize-x flex-col overflow-auto border-l border-white/[0.08] bg-[#0d0f13]/95 p-3 backdrop-blur-md" style={{ direction: "rtl" }}>
      <div className="flex-1" style={{ direction: "ltr" }}>
        <div className="flex items-center"><div className={MICRO}>Inspector</div><button type="button" className="ml-auto rounded-md px-2 py-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-200" onClick={onClose} aria-label="Close inspector panel">×</button></div>
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
            <ClearanceField meta={selectedMarker.meta} onMeta={(patch, coalesce) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { meta: { ...selectedMarker.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedMarker.id}` })} />
            <TriggerInspector
              target="marker"
              meta={selectedMarker.meta}
              onMeta={(patch, coalesce) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { meta: { ...selectedMarker.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedMarker.id}` })}
            />
            <ParentField session={session} id={selectedMarker.id} />
            {isSceneKind(selectedMarker.kind) ? (
              <KindInspector
                object={markerObject(selectedMarker)}
                meta={selectedMarker.meta}
                onMeta={(patch, coalesce) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { meta: { ...selectedMarker.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedMarker.id}` })}
              />
            ) : null}
            <GeneratorInspector
              meta={selectedMarker.meta}
              onMeta={(patch, coalesce) => session.dispatch({ type: "setMarker", id: selectedMarker.id, patch: { meta: { ...selectedMarker.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedMarker.id}` })}
            />
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
            <ClearanceField meta={selectedVolume.meta} onMeta={(patch, coalesce) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { meta: { ...selectedVolume.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedVolume.id}` })} />
            <TriggerInspector
              target="volume"
              meta={selectedVolume.meta}
              onMeta={(patch, coalesce) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { meta: { ...selectedVolume.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedVolume.id}` })}
            />
            <ParentField session={session} id={selectedVolume.id} />
            <VegetationFields
              volume={selectedVolume}
              onMeta={(patch, coalesce) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { meta: { ...selectedVolume.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedVolume.id}` })}
            />
            {isSceneKind(selectedVolume.kind) ? (
              <KindInspector
                object={volumeObject(selectedVolume)}
                meta={selectedVolume.meta}
                onMeta={(patch, coalesce) => session.dispatch({ type: "setVolume", id: selectedVolume.id, patch: { meta: { ...selectedVolume.meta, ...patch } } }, { coalesce: `${coalesce}:${selectedVolume.id}` })}
              />
            ) : null}
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
            {pathPoint !== null && pathPoint.pathId === selectedPath.id ? (
              <div className="space-y-2">
                <div className="text-neutral-400">Point {pathPoint.index + 1}/{selectedPath.points.length}</div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-md bg-white/[0.07] px-2 py-1 ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/15" onClick={() => { const at = pathPoint!.index; const points = [...selectedPath.points.slice(0, at + 1), { ...selectedPath.points[at]! }, ...selectedPath.points.slice(at + 1)]; session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Insert point</button>
                  <button type="button" className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-200 ring-1 ring-inset ring-rose-400/25 transition-colors hover:bg-rose-500/25 disabled:opacity-40" disabled={selectedPath.points.length <= 2} onClick={() => { const points = selectedPath.points.filter((_, index) => index !== pathPoint!.index); ui.patch({ pathPoint: null }); session.dispatch({ type: "setPath", id: selectedPath.id, patch: { points } }); }}>Delete point</button>
                </div>
              </div>
            ) : <div className="text-[10px] text-neutral-500">Click a vertex sphere to edit points.</div>}
            {isSceneKind(selectedPath.kind) ? (
              <KindInspector
                object={pathObject(selectedPath)}
                meta={selectedPath.meta}
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
  );
}
