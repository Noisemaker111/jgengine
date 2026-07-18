import { useMemo, useState } from "react";

import type { EditorSession } from "@jgengine/core/editor/index";

import { clearMaterialAssignmentPatch } from "./authoredComponentMeta";
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

/**
 * Materials workspace home panel: browse every placeable's real `meta.materialId` from the live
 * document, filter by assignment/palette id/text, select into the hierarchy, and assign/clear via
 * the existing `assign_material` / `batch_set_properties` RPC seams. No fake thumbnails.
 * @internal — mounted by `EditorChrome` when the materials workspace is active.
 */
export function MaterialsWorkspacePanel({
  session,
  api,
}: {
  session: EditorSession;
  api: EditorHostApi;
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const selection = useStoreSelector(session, (state) => state.selection, shallowArrayEqual);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MaterialAssignmentFilter>("all");

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
