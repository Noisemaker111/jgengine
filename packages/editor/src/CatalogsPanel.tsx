import { useMemo, useState } from "react";

import type { EditorCatalogDefinition, EditorSession } from "@jgengine/core/editor/index";
import { findEditorCatalog, findEditorCatalogEntry } from "@jgengine/core/editor/index";

import { SchemaInspector } from "./SchemaInspector";
import { useStoreSelector } from "./useStoreSelector";

/**
 * Gameplay data catalogs panel — lists game-exported catalogs and edits entries via SchemaInspector.
 * Values persist on `document.catalogs` and undo with the same coalesce keys as meta patches.
 * @internal — mounted by `EditorChrome` as a left-aside tab.
 */
export function CatalogsPanel({
  session,
  definitions,
}: {
  session: EditorSession;
  definitions: readonly EditorCatalogDefinition[];
}) {
  const document = useStoreSelector(session, (state) => state.document);
  const [catalogId, setCatalogId] = useState(definitions[0]?.id ?? "");
  const [entryId, setEntryId] = useState(definitions[0]?.entries[0]?.id ?? "");

  const definition = useMemo(
    () => definitions.find((catalog) => catalog.id === catalogId) ?? definitions[0],
    [definitions, catalogId],
  );

  if (definitions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 text-[10px] text-neutral-500">
        No gameplay catalogs. Export `editorCatalogs` from the game (ParamSchema + default entries).
      </div>
    );
  }

  const activeDefinition = definition ?? definitions[0]!;
  const data = findEditorCatalog(document, activeDefinition.id);
  const entries = data?.entries ?? activeDefinition.entries;
  const activeEntryId = entries.some((entry) => entry.id === entryId) ? entryId : entries[0]?.id ?? "";
  const entry = findEditorCatalogEntry(document, activeDefinition.id, activeEntryId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <label className="flex items-center gap-2 text-[10px] text-neutral-400">
        <span className="shrink-0 uppercase tracking-wider text-neutral-500">Catalog</span>
        <select
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 outline-none focus:border-cyan-400/60"
          value={activeDefinition.id}
          onChange={(event) => {
            const next = definitions.find((catalog) => catalog.id === event.target.value);
            setCatalogId(event.target.value);
            setEntryId(next?.entries[0]?.id ?? "");
          }}
        >
          {definitions.map((catalog) => (
            <option key={catalog.id} value={catalog.id}>
              {catalog.label}
            </option>
          ))}
        </select>
      </label>
      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {entries.map((row) => {
          const selected = row.id === activeEntryId;
          return (
            <button
              key={row.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] ring-1 ring-inset transition-colors ${
                selected
                  ? "bg-amber-500/15 text-amber-100 ring-amber-400/30"
                  : "bg-white/[0.03] text-neutral-300 ring-white/[0.06] hover:bg-white/[0.06]"
              }`}
              onClick={() => setEntryId(row.id)}
            >
              <span className="truncate font-medium">{row.label ?? row.id}</span>
              <span className="ml-2 shrink-0 text-[9px] text-neutral-500">{row.id}</span>
            </button>
          );
        })}
      </div>
      {entry !== undefined ? (
        <SchemaInspector
          schema={activeDefinition.schema}
          label={entry.label ?? entry.id}
          accent="#fbbf24"
          meta={entry.meta}
          onMeta={(patch, coalesce) => {
            session.dispatch(
              {
                type: "setCatalogEntry",
                catalogId: activeDefinition.id,
                entryId: entry.id,
                patch: { meta: { ...entry.meta, ...patch } },
              },
              { coalesce: `catalog:${activeDefinition.id}:${entry.id}:${coalesce}` },
            );
          }}
        />
      ) : null}
    </div>
  );
}
