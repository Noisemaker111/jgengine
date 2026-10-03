import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { EditorDocument, EditorSession } from "@jgengine/core/editor/index";
import { createMaterialTemplate, parseMaterialAssignments, type MaterialAsset, type MaterialAssignment, type MaterialSelector, type MaterialTemplate } from "@jgengine/core/material/materialAsset";

import { clearMaterialAssignmentPatch } from "./authoredComponentMeta";
import { MaterialAssetEditor } from "./MaterialAssetEditor";
import {
  filterMaterialAssignments,
  listMaterialAssignments,
  summarizeMaterialUsage,
  type MaterialAssignmentFilter,
  type MaterialAssignmentRow,
} from "./materialAssignments";
import type { EditorHostApi } from "./session";
import { TERRAIN_MATERIALS } from "./uiStore";
import { FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./shell/theme";
import { EmptyState } from "./shell/ui";
import { shallowArrayEqual, useStoreSelector } from "./useStoreSelector";

const CHIP =
  `rounded-[5px] border px-1.5 py-0.5 text-[10px] transition-colors ${FOCUS_RING}`;
const CHIP_IDLE = "border-white/[0.08] bg-[#191d24] text-neutral-400 hover:bg-[#1f242d] hover:text-neutral-200";
const CHIP_ACTIVE = "border-cyan-400/40 bg-cyan-500/15 text-cyan-100";

function materialColor(materialId: string | null): string {
  if (materialId === null) return "transparent";
  return TERRAIN_MATERIALS.find((material) => material.id === materialId)?.color ?? "#64748b";
}

function materialLabel(materialId: string): string {
  return TERRAIN_MATERIALS.find((material) => material.id === materialId)?.label ?? materialId;
}

/** Read the selected model's first usable assignment for workspace initialization. @internal */
export function initialMaterialAssignment(document: Pick<EditorDocument, "markers" | "materialAssets">, selection: readonly string[]): MaterialAssignment | null {
  const marker = document.markers.find((item) => selection.includes(item.id));
  const value = marker?.meta?.materialAssignments;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    try {
      const assignment = parseMaterialAssignments([item])[0]!;
      if (document.materialAssets?.some((asset) => asset.id === assignment.materialId)) return assignment;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Materials workspace home panel: browse every placeable's real `meta.materialId` from the live
 * document, filter by assignment/palette id/text, select into the hierarchy, and assign/clear via
 * the existing `assign_material` / `batch_set_properties` RPC seams. No fake thumbnails.
 * @internal — mounted by `EditorChrome` when the materials workspace is active.
 */
export function MaterialsWorkspacePanel({
  session,
  api,
  preview,
  onSave,
  materialSlots,
  previewError,
}: {
  session: EditorSession;
  api: EditorHostApi;
  preview?: (asset: MaterialAsset | undefined, mode: "neutral" | "game") => ReactNode;
  onSave?: () => void;
  materialSlots?: readonly { mesh: string; slot: string; slotIndex: number }[];
  previewError?: string | null;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MaterialAssignmentFilter>("all");
  const [tab, setTab] = useState<"assets" | "assignments">("assets");
  const [initialAssignment] = useState(() => { const state = session.getState(); return initialMaterialAssignment(state.document, state.selection); });
  const [activeAssetId, setActiveAssetId] = useState<string | null>(initialAssignment?.materialId ?? null);
  const [template, setTemplate] = useState<MaterialTemplate>("wool");
  const [newId, setNewId] = useState("");
  const [mesh, setMesh] = useState(initialAssignment?.selector.mesh ?? "");
  const [slot, setSlot] = useState(initialAssignment?.selector.slot ?? "");
  const [slotIndex, setSlotIndex] = useState(initialAssignment?.selector.slotIndex === undefined ? "" : String(initialAssignment.selector.slotIndex));
  const [error, setError] = useState<string | null>(null);
  const selectionKey = selection.join("\0");
  useEffect(() => {
    const state = session.getState();
    const assignment = initialMaterialAssignment(state.document, state.selection);
    if (assignment) setActiveAssetId(assignment.materialId);
    setMesh(assignment?.selector.mesh ?? "");
    setSlot(assignment?.selector.slot ?? "");
    setSlotIndex(assignment?.selector.slotIndex === undefined ? "" : String(assignment.selector.slotIndex));
  }, [selectionKey, session]);
  const assets = document.materialAssets ?? [];
  const activeAsset = assets.find((asset) => asset.id === activeAssetId) ?? assets[0];
  const assignmentErrors: string[] = [];
  const selectedAssignments = document.markers.filter((marker) => selection.includes(marker.id)).flatMap((marker) => {
    const value = marker.meta?.materialAssignments;
    if (!Array.isArray(value)) return [];
    try {
      return parseMaterialAssignments(value).map((assignment) => ({ ...assignment, objectId: marker.id, objectName: marker.label ?? marker.id }));
    } catch (failure) {
      assignmentErrors.push(`${marker.id}: ${failure instanceof Error ? failure.message : String(failure)}`);
      return [];
    }
  });

  const rows = useMemo(() => listMaterialAssignments(document), [document]);
  const filtered = useMemo(() => filterMaterialAssignments(rows, query, filter), [rows, query, filter]);
  const usage = useMemo(() => summarizeMaterialUsage(rows), [rows]);
  const assignedCount = rows.filter((row) => row.materialId !== null).length;

  const selectRow = (id: string, additive: boolean) => {
    if (additive) {
      const next = selection.includes(id) ? selection.filter((entry) => entry !== id) : [...selection, id];
      api.handle({ method: "select", ids: next });
      return;
    }
    api.handle({ method: "select", ids: [id] });
  };

  const assignTo = (ids: readonly string[], materialId: string) => {
    if (ids.length === 0) return;
    api.handle({ method: "assign_material", ids: [...ids], materialId });
  };

  const clearFrom = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    api.handle({
      method: "batch_set_properties",
      ids: [...ids],
      meta: clearMaterialAssignmentPatch(),
    });
  };

  const filterActive = (candidate: MaterialAssignmentFilter): boolean => {
    if (typeof filter === "object" && typeof candidate === "object") return filter.materialId === candidate.materialId;
    return filter === candidate;
  };

  const tabs = <div className="flex shrink-0 gap-1 border-b border-white/[0.06] p-2" role="tablist" aria-label="Material workspace views">
    {(["assets", "assignments"] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={tab === view} className={`${CHIP} flex-1 ${tab === view ? CHIP_ACTIVE : CHIP_IDLE}`} onClick={() => setTab(view)}>{view === "assets" ? "Surface assets" : "Legacy assignments"}</button>)}
  </div>;

  if (tab === "assets") return <div className="flex min-h-0 flex-1 flex-col">
    {tabs}
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="space-y-2 border-b border-white/[0.06] p-2">
        <label className="block space-y-1"><span className={MICRO_LABEL}>Reusable material asset</span><select aria-label="Choose material asset" value={activeAsset?.id ?? ""} className={`w-full px-2 py-1 ${INPUT_CLS}`} onChange={(event) => setActiveAssetId(event.target.value)}>{assets.length ? assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>) : <option value="">No authored materials</option>}</select></label>
        {activeAsset ? <button type="button" className={`${CHIP} border-rose-400/25 text-rose-200`} onClick={() => { const result = api.handle({ method: "remove_material_asset", id: activeAsset.id }); setError(result.ok ? null : result.error ?? "Material operation failed."); }}>Remove unused asset</button> : null}
        <details><summary className={`cursor-pointer text-[11px] text-neutral-400 ${FOCUS_RING}`}>Create from an editable starting point</summary><div className="mt-2 space-y-2">
          <select aria-label="Material starting point" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={template} onChange={(event) => setTemplate(event.target.value as MaterialTemplate)}>{["wool", "cotton", "silk", "brushed-metal", "glass", "coated-plastic", "stone", "hair-cards"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select>
          <input aria-label="New material stable ID" value={newId} onChange={(event) => setNewId(event.target.value)} placeholder="game/my-original-surface" className={`w-full px-2 py-1 ${INPUT_CLS}`} />
          <button type="button" disabled={!newId.trim() || assets.some((asset) => asset.id === newId.trim())} className={`${CHIP} ${CHIP_IDLE}`} onClick={() => { const asset = createMaterialTemplate(template, newId.trim()); const result = api.handle({ method: "upsert_material_asset", asset }); if (!result.ok) setError(result.error ?? "Material operation failed."); else { setActiveAssetId(asset.id); setNewId(""); setError(null); } }}>Create asset</button>
          <p className="text-[10px] text-neutral-500">Starting points contain authored response parameters; your game supplies original textures, geometry and art direction.</p>
        </div></details>
        {activeAsset ? <details><summary className={`cursor-pointer text-[11px] text-neutral-400 ${FOCUS_RING}`}>Assign to selected material slot</summary><div className="mt-2 space-y-2">
          <p className="text-[10px] text-neutral-500">Choose a loaded material slot. Assignments preserve other slots on the model.</p>
          {materialSlots?.length ? <select aria-label="Choose imported material slot" className={`w-full px-2 py-1 ${INPUT_CLS}`} value={String(materialSlots.findIndex((entry) => entry.mesh === mesh && entry.slot === slot && String(entry.slotIndex) === slotIndex))} onChange={(event) => { const entry = materialSlots[Number(event.target.value)]; if (!entry) return; setMesh(entry.mesh); setSlot(entry.slot); setSlotIndex(String(entry.slotIndex)); }}><option value="-1">Choose a slot…</option>{materialSlots.map((entry, index) => <option key={`${entry.mesh}:${entry.slotIndex}:${index}`} value={String(index)}>{entry.mesh || "Unnamed mesh"} / {entry.slot || `slot ${entry.slotIndex}`}</option>)}</select> : <p className="text-[10px] text-neutral-500">Select a model to inspect its imported slots, or enter an exact selector below.</p>}
          <details><summary className={`cursor-pointer text-[10px] text-neutral-400 ${FOCUS_RING}`}>Advanced exact selector</summary><div className="mt-2 space-y-2">
          <input aria-label="Assignment mesh name" placeholder="Mesh name (optional)" value={mesh} onChange={(event) => setMesh(event.target.value)} className={`w-full px-2 py-1 ${INPUT_CLS}`} />
          <input aria-label="Assignment material slot name" placeholder="Material slot name (optional)" value={slot} onChange={(event) => setSlot(event.target.value)} className={`w-full px-2 py-1 ${INPUT_CLS}`} />
          <input aria-label="Assignment material slot index" type="number" min="0" step="1" placeholder="Slot index (optional)" value={slotIndex} onChange={(event) => setSlotIndex(event.target.value)} className={`w-full px-2 py-1 ${INPUT_CLS}`} />
          </div></details>
          <button type="button" className={`${CHIP} ${CHIP_IDLE}`} disabled={selection.length === 0 || (!mesh.trim() && !slot.trim() && !slotIndex)} onClick={() => {
            const selector: MaterialSelector = {};
            if (mesh.trim()) selector.mesh = mesh.trim();
            if (slot.trim()) selector.slot = slot.trim();
            if (slotIndex) selector.slotIndex = Number(slotIndex);
            const result = api.handle({ method: "assign_material_asset", ids: [...selection], materialId: activeAsset.id, selector });
            setError(result.ok ? null : result.error ?? "Material operation failed.");
          }}>Assign to selection ({selection.length})</button>
          {selectedAssignments.map((assignment, index) => <button key={`${assignment.objectId}:${index}`} type="button" className={`${CHIP} ${CHIP_IDLE} block w-full text-left`} onClick={() => { setActiveAssetId(assignment.materialId); setMesh(assignment.selector.mesh ?? ""); setSlot(assignment.selector.slot ?? ""); setSlotIndex(assignment.selector.slotIndex === undefined ? "" : String(assignment.selector.slotIndex)); }}>{assignment.objectName}: {assignment.selector.mesh ?? "any mesh"} / {assignment.selector.slot ?? `slot ${assignment.selector.slotIndex ?? "any"}`} → {assignment.materialId}</button>)}
          {selectedAssignments.length ? <button type="button" className={`${CHIP} border-rose-400/25 text-rose-200`} onClick={() => { const result = api.handle({ method: "clear_material_assets", ids: [...selection] }); setError(result.ok ? null : result.error ?? "Material operation failed."); }}>Restore selected objects' imported materials</button> : null}
        </div></details> : null}
        <div className="flex gap-1"><button type="button" className={`${CHIP} ${CHIP_IDLE}`} onClick={() => api.handle({ method: "undo" })}>Undo</button><button type="button" className={`${CHIP} ${CHIP_IDLE}`} onClick={() => api.handle({ method: "redo" })}>Redo</button>{onSave ? <button type="button" className={`${CHIP} ${CHIP_IDLE}`} onClick={onSave}>Save scene</button> : null}</div>
        {error ? <p role="alert" className="text-[10px] text-rose-300">{error}</p> : null}
        {previewError ? <p role="alert" className="text-[10px] text-rose-300">Preview: {previewError}</p> : null}
        {assignmentErrors.map((message) => <p key={message} role="alert" className="text-[10px] text-rose-300">{message}</p>)}
      </div>
      {activeAsset ? <MaterialAssetEditor key={activeAsset.id} asset={activeAsset} preview={preview} onChange={(asset, coalesce) => { const result = api.handle({ method: "upsert_material_asset", asset, coalesce }); setError(result.ok ? null : result.error ?? "Material operation failed."); }} /> : <><div className="p-2">{preview?.(undefined, "neutral")}</div><EmptyState icon="sphere" title="No material assets" description="Create an editable starting point, then assign it to a named mesh or material slot. Existing imported materials remain intact." /></>}
    </div>
  </div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs}
      <div className="space-y-2 border-b border-white/[0.06] p-2">
        <div className={MICRO_LABEL}>Materials</div>
        <p className="text-[10px] leading-snug text-neutral-500">
          Document material assignments — select a row to inspect, assign from the palette, or clear.
        </p>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter objects…"
          aria-label="Filter material assignments"
          className={`h-7 w-full px-2 ${INPUT_CLS}`}
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Assignment filters">
          {(
            [
              { id: "all" as const, label: `All (${rows.length})` },
              { id: "assigned" as const, label: `Assigned (${assignedCount})` },
              { id: "unassigned" as const, label: `None (${rows.length - assignedCount})` },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={`${CHIP} ${filterActive(entry.id) ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {usage.length > 0 ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Materials in use">
            {usage.map((entry) => (
              <button
                key={entry.materialId}
                type="button"
                onClick={() => setFilter({ materialId: entry.materialId })}
                title={`Show objects using ${entry.materialId}`}
                className={`${CHIP} flex items-center gap-1 ${filterActive({ materialId: entry.materialId }) ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-white/20"
                  style={{ backgroundColor: materialColor(entry.materialId) }}
                />
                {materialLabel(entry.materialId)}
                <span className="tabular-nums text-neutral-600">{entry.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {selection.length > 0 ? (
          <div className="space-y-1.5 rounded-[6px] border border-white/[0.07] bg-white/[0.02] p-1.5">
            <div className="text-[10px] text-neutral-500">
              Selection ({selection.length}) — assign or clear
            </div>
            <div className="flex flex-wrap gap-1">
              {TERRAIN_MATERIALS.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  title={`Assign ${material.label} to selection`}
                  onClick={() => assignTo(selection, material.id)}
                  className={`${CHIP} flex items-center gap-1 ${CHIP_IDLE}`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-white/20"
                    style={{ backgroundColor: material.color }}
                  />
                  {material.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => clearFrom(selection)}
                className={`${CHIP} border-rose-400/25 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`}
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-1.5" role="list" aria-label="Material assignments">
        {filtered.length === 0 ? (
          <EmptyState
            icon="sphere"
            title={rows.length === 0 ? "No placeables" : "No matches"}
            description={
              rows.length === 0
                ? "Add markers, volumes, or paths to the scene, then assign materials from the palette or content browser."
                : "Nothing matches this filter. Try All, or clear the search."
            }
          />
        ) : (
          filtered.map((row) => (
            <MaterialRow
              key={row.id}
              row={row}
              selected={selection.includes(row.id)}
              onSelect={selectRow}
              onAssign={(materialId) => assignTo([row.id], materialId)}
              onClear={() => clearFrom([row.id])}
            />
          ))
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/[0.06] px-2 text-[10px] text-neutral-600">
        <span className="tabular-nums">
          {filtered.length} of {rows.length} objects · {assignedCount} assigned
        </span>
      </div>
    </div>
  );
}

function MaterialRow({
  row,
  selected,
  onSelect,
  onAssign,
  onClear,
}: {
  row: MaterialAssignmentRow;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onAssign: (materialId: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      role="listitem"
      className={`group mb-0.5 flex items-center gap-1.5 rounded-[5px] px-1.5 py-1 transition-colors ${
        selected ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-400/30" : "hover:bg-white/[0.04]"
      }`}
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
        style={{
          backgroundColor: materialColor(row.materialId),
          opacity: row.materialId === null ? 0.35 : 1,
          backgroundImage:
            row.materialId === null
              ? "linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%), linear-gradient(45deg, #333 25%, transparent 25%, transparent 75%, #333 75%)"
              : undefined,
          backgroundSize: row.materialId === null ? "4px 4px" : undefined,
          backgroundPosition: row.materialId === null ? "0 0, 2px 2px" : undefined,
        }}
        title={row.materialId ?? "no material"}
      />
      <button
        type="button"
        onClick={(event) => onSelect(row.id, event.shiftKey || event.metaKey || event.ctrlKey)}
        className={`min-w-0 flex-1 truncate text-left ${FOCUS_RING}`}
        title={`${row.label} (${row.id}) — click to select`}
      >
        <span className="block truncate text-[11px] text-neutral-200">{row.label}</span>
        <span className="block truncate text-[9px] text-neutral-600">
          {row.kind} · {row.objectKind}
          {row.materialId !== null ? ` · ${row.materialId}` : " · none"}
        </span>
      </button>
      <select
        aria-label={`Assign material to ${row.label}`}
        className={`h-6 max-w-[5.5rem] shrink-0 px-1 text-[10px] opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 ${INPUT_CLS}`}
        value={row.materialId ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          if (value.length === 0) onClear();
          else onAssign(value);
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <option value="">none</option>
        {TERRAIN_MATERIALS.map((material) => (
          <option key={material.id} value={material.id}>
            {material.label}
          </option>
        ))}
      </select>
    </div>
  );
}
