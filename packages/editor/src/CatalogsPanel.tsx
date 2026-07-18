import { useMemo, useState } from "react";

import type { EditorCatalogDefinition, EditorSession } from "@jgengine/core/editor/index";
import { findEditorCatalog, findEditorCatalogEntry } from "@jgengine/core/editor/index";
import { parseParams, type ParamField, type ParamSchema } from "@jgengine/core/scene/sceneKinds";

import { SchemaInspector } from "./SchemaInspector";
import { BORDER, CONTROL, FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./shell/theme";
import { useStoreSelector } from "./useStoreSelector";

function slugifyEntryId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The field types the document schema editor can author. */
const FIELD_TYPES: readonly ParamField["type"][] = [
  "range",
  "number",
  "bool",
  "select",
  "color",
  "text",
  "seed",
  "weightedList",
  "action",
];

/**
 * Rebuilds a valid {@link ParamField} for a new `type`, preserving `key`/`label` and reusing prior
 * numeric bounds/default where the target type still carries them. Every type gets a schema-valid
 * default so `parseParams` (which drives the reclamp on `setCatalogSchema`) always has a value to read.
 */
function coerceField(prev: ParamField, type: ParamField["type"]): ParamField {
  const key = prev.key;
  const label = prev.label;
  const prevNumber = "default" in prev && typeof prev.default === "number" ? prev.default : 0;
  const prevMin = "min" in prev && typeof prev.min === "number" ? prev.min : undefined;
  const prevMax = "max" in prev && typeof prev.max === "number" ? prev.max : undefined;
  const prevString = "default" in prev && typeof prev.default === "string" ? prev.default : "";
  switch (type) {
    case "range":
      return { key, label, type: "range", min: prevMin ?? 0, max: prevMax ?? 10, default: prevNumber };
    case "number":
      return { key, label, type: "number", default: prevNumber, ...(prevMin === undefined ? {} : { min: prevMin }), ...(prevMax === undefined ? {} : { max: prevMax }) };
    case "bool":
      return { key, label, type: "bool", default: false };
    case "select":
      return { key, label, type: "select", options: [], default: prevString };
    case "color":
      return { key, label, type: "color", default: prevString || "#888888" };
    case "text":
      return { key, label, type: "text", default: prevString };
    case "seed":
      return { key, label, type: "seed", default: prevString };
    case "weightedList":
      return { key, label, type: "weightedList", default: [] };
    case "action":
      return { key, label, type: "action", action: "randomize" };
  }
}

const INPUT = `min-w-0 px-2 py-1 text-[11px] ${INPUT_CLS}`;
const BTN = `${CONTROL} px-2 py-1 text-[11px] font-medium disabled:opacity-40`;

/**
 * Gameplay data catalogs panel — lists merged (game-exported + document-authored) catalogs, lets an
 * author create a brand-new document catalog, author its schema fields, and edit rows via
 * SchemaInspector. Row values and (for document catalogs) the schema itself persist on
 * `document.catalogs` and undo with the same coalesce keys as meta patches.
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
  const [newRowId, setNewRowId] = useState("");
  const [newCatalogId, setNewCatalogId] = useState("");
  const [newCatalogLabel, setNewCatalogLabel] = useState("");

  const definition = useMemo(
    () => definitions.find((catalog) => catalog.id === catalogId) ?? definitions[0],
    [definitions, catalogId],
  );

  const addCatalog = () => {
    const id = slugifyEntryId(newCatalogId);
    if (id.length === 0) return;
    const label = newCatalogLabel.trim();
    session.dispatch({
      type: "addCatalog",
      id,
      ...(label.length === 0 ? {} : { label }),
      schema: { fields: [] },
    });
    setNewCatalogId("");
    setNewCatalogLabel("");
    setCatalogId(id);
    setEntryId("");
  };

  const newCatalogForm = (
    <form
      className={`flex flex-col gap-1 rounded-[6px] border ${BORDER} bg-white/[0.02] p-2`}
      onSubmit={(event) => {
        event.preventDefault();
        addCatalog();
      }}
    >
      <span className={MICRO_LABEL}>New catalog</span>
      <div className="flex items-center gap-1">
        <input
          className={`flex-1 ${INPUT}`}
          value={newCatalogId}
          placeholder="catalog id (e.g. towers)"
          onChange={(event) => setNewCatalogId(event.target.value)}
        />
        <input
          className={`flex-1 ${INPUT}`}
          value={newCatalogLabel}
          placeholder="label (optional)"
          onChange={(event) => setNewCatalogLabel(event.target.value)}
        />
        <button
          type="submit"
          disabled={slugifyEntryId(newCatalogId).length === 0}
          className={BTN}
        >
          ＋ New catalog
        </button>
      </div>
    </form>
  );

  if (definitions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="text-[10px] text-neutral-500">
          No gameplay catalogs yet. Create one below, or export `editorCatalogs` from the game (ParamSchema +
          default entries).
        </div>
        {newCatalogForm}
      </div>
    );
  }

  const activeDefinition = definition ?? definitions[0]!;
  const data = findEditorCatalog(document, activeDefinition.id);
  const entries = data?.entries ?? activeDefinition.entries;
  const activeEntryId = entries.some((entry) => entry.id === entryId) ? entryId : entries[0]?.id ?? "";
  const entry = findEditorCatalogEntry(document, activeDefinition.id, activeEntryId);
  // A document-authored catalog carries its own schema — only those are schema-editable here.
  // Game-exported catalogs keep their schema in code and stay read-only.
  const documentSchema = data?.schema;

  const addRow = () => {
    const id = slugifyEntryId(newRowId);
    if (id.length === 0) return;
    // Seed the new row from the schema defaults so it is immediately editable and schema-valid.
    const meta = parseParams(activeDefinition.schema, undefined) as Record<string, unknown>;
    session.dispatch({ type: "addCatalogEntry", catalogId: activeDefinition.id, entry: { id, meta } });
    setNewRowId("");
    setEntryId(id);
  };

  const removeRow = (id: string) => {
    session.dispatch({ type: "removeCatalogEntry", catalogId: activeDefinition.id, entryId: id });
    if (entryId === id) setEntryId("");
  };

  // Rebuilds the whole `fields` array and dispatches ONE setCatalogSchema; the reducer reclamps every
  // row so the row list + SchemaInspector re-render against clamped values.
  const commitFields = (fields: ParamField[]) => {
    if (documentSchema === undefined) return;
    const schema: ParamSchema = { fields, ...(documentSchema.groups === undefined ? {} : { groups: documentSchema.groups }) };
    session.dispatch({ type: "setCatalogSchema", id: activeDefinition.id, schema });
  };

  const schemaFields = documentSchema?.fields ?? [];

  const patchField = (index: number, next: ParamField) => {
    commitFields(schemaFields.map((field, i) => (i === index ? next : field)));
  };

  const addField = () => {
    let key = "field";
    let n = 2;
    const taken = new Set(schemaFields.map((field) => field.key));
    while (taken.has(key)) {
      key = `field_${n}`;
      n += 1;
    }
    commitFields([...schemaFields, { key, type: "number", default: 0 }]);
  };

  const removeField = (index: number) => {
    commitFields(schemaFields.filter((_, i) => i !== index));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      {newCatalogForm}
      <label className="flex items-center gap-2 text-[10px] text-neutral-400">
        <span className="shrink-0 uppercase tracking-wider text-neutral-500">Catalog</span>
        <select
          className={`min-w-0 flex-1 px-2 py-1 ${INPUT_CLS}`}
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
        {documentSchema !== undefined ? (
          <button
            type="button"
            className={`shrink-0 rounded-[5px] px-1.5 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-rose-500/20 hover:text-rose-200 ${FOCUS_RING}`}
            title={`Remove catalog ${activeDefinition.id}`}
            aria-label={`Remove catalog ${activeDefinition.id}`}
            onClick={() => {
              session.dispatch({ type: "removeCatalog", id: activeDefinition.id });
              setCatalogId("");
              setEntryId("");
            }}
          >
            ×
          </button>
        ) : null}
      </label>
      {documentSchema !== undefined ? (
        <div className={`flex flex-col gap-1 rounded-[6px] border ${BORDER} bg-white/[0.02] p-2`}>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">Schema fields</span>
          {schemaFields.map((field, index) => {
            const hasBounds = field.type === "range" || field.type === "number";
            const numberDefault = "default" in field && typeof field.default === "number" ? field.default : undefined;
            const min = "min" in field && typeof field.min === "number" ? field.min : undefined;
            const max = "max" in field && typeof field.max === "number" ? field.max : undefined;
            return (
              <div key={index} className="flex flex-wrap items-center gap-1">
                <input
                  className={`w-24 ${INPUT}`}
                  value={field.key}
                  placeholder="key"
                  onChange={(event) => patchField(index, { ...field, key: event.target.value } as ParamField)}
                />
                <select
                  className={`w-24 ${INPUT}`}
                  value={field.type}
                  onChange={(event) => patchField(index, coerceField(field, event.target.value as ParamField["type"]))}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {numberDefault !== undefined ? (
                  <input
                    type="number"
                    className={`w-16 ${INPUT}`}
                    value={numberDefault}
                    title="default"
                    onChange={(event) => patchField(index, { ...field, default: Number(event.target.value) } as ParamField)}
                  />
                ) : field.type === "bool" ? (
                  <input
                    type="checkbox"
                    className="accent-emerald-400"
                    checked={field.default}
                    title="default"
                    onChange={(event) => patchField(index, { ...field, default: event.target.checked })}
                  />
                ) : "default" in field && typeof field.default === "string" ? (
                  <input
                    className={`w-16 ${INPUT}`}
                    value={field.default}
                    title="default"
                    onChange={(event) => patchField(index, { ...field, default: event.target.value } as ParamField)}
                  />
                ) : null}
                {hasBounds ? (
                  <>
                    <input
                      type="number"
                      className={`w-14 ${INPUT}`}
                      value={min ?? ""}
                      placeholder="min"
                      title="min"
                      onChange={(event) => {
                        const value = event.target.value;
                        const next = { ...field } as Record<string, unknown>;
                        if (value === "") delete next.min;
                        else next.min = Number(value);
                        patchField(index, next as unknown as ParamField);
                      }}
                    />
                    <input
                      type="number"
                      className={`w-14 ${INPUT}`}
                      value={max ?? ""}
                      placeholder="max"
                      title="max"
                      onChange={(event) => {
                        const value = event.target.value;
                        const next = { ...field } as Record<string, unknown>;
                        if (value === "") delete next.max;
                        else next.max = Number(value);
                        patchField(index, next as unknown as ParamField);
                      }}
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  className={`shrink-0 rounded-[5px] px-1.5 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-rose-500/20 hover:text-rose-200 ${FOCUS_RING}`}
                  title={`Remove field ${field.key}`}
                  aria-label={`Remove field ${field.key}`}
                  onClick={() => removeField(index)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className={BTN}
            onClick={addField}
          >
            + Field
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
        {entries.map((row) => {
          const selected = row.id === activeEntryId;
          return (
            <div
              key={row.id}
              className={`flex items-center gap-1 rounded-md ring-1 ring-inset transition-colors ${
                selected
                  ? "bg-amber-500/15 text-amber-100 ring-amber-400/30"
                  : "bg-white/[0.03] text-neutral-300 ring-white/[0.06] hover:bg-white/[0.06]"
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-left text-[11px]"
                onClick={() => setEntryId(row.id)}
              >
                <span className="truncate font-medium">{row.label ?? row.id}</span>
                <span className="ml-2 shrink-0 text-[9px] text-neutral-500">{row.id}</span>
              </button>
              <button
                type="button"
                className={`shrink-0 rounded-[5px] px-1.5 py-1 text-[11px] text-neutral-500 transition-colors hover:bg-rose-500/20 hover:text-rose-200 ${FOCUS_RING}`}
                title={`Remove ${row.id}`}
                aria-label={`Remove ${row.id}`}
                onClick={() => removeRow(row.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          addRow();
        }}
      >
        <input
          className={`min-w-0 flex-1 px-2 py-1 text-[11px] ${INPUT_CLS}`}
          value={newRowId}
          placeholder="new row id (e.g. goblin)"
          onChange={(event) => setNewRowId(event.target.value)}
        />
        <button
          type="submit"
          disabled={slugifyEntryId(newRowId).length === 0}
          className={BTN}
        >
          + Row
        </button>
      </form>
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
