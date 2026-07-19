import { useState } from "react";

import {
  parseParams,
  randomizeGroupParams,
  resetGroupParams,
  type ParamField,
  type ParamSchema,
  type WeightedParamEntry,
} from "@jgengine/core/scene/sceneKinds";

import { BORDER, CONTROL, FOCUS_RING, INPUT_CLS, MICRO_LABEL } from "./shell/theme";

const INPUT = `px-2 py-1 ${INPUT_CLS}`;
const MICRO = MICRO_LABEL;
const BTN = `${CONTROL} px-2 py-1 text-[10px] disabled:opacity-40`;

/** A patch to a single meta key, coalesced under a stable undo key. */
export type MetaPatch = (patch: Record<string, unknown>, coalesce: string) => void;

/** One-click archetype bundles: picking a preset writes its whole value bag as a single meta patch. */
function PresetRow({ schema, onMeta }: { schema: ParamSchema; onMeta: MetaPatch }) {
  const presets = schema.presets ?? [];
  if (presets.length === 0) return null;
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={MICRO}>preset</span>
      <select
        className={`w-32 ${INPUT}`}
        value=""
        onChange={(event) => {
          const preset = presets.find((entry) => entry.id === event.target.value);
          if (preset !== undefined) onMeta({ ...preset.values }, `preset:${preset.id}`);
        }}
      >
        <option value="" disabled>
          apply preset…
        </option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label ?? preset.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function labelOf(field: ParamField): string {
  return field.label ?? field.key;
}

function FieldRow({ field, meta, onMeta }: { field: ParamField; meta: Record<string, unknown> | undefined; onMeta: MetaPatch }) {
  const params = parseParams({ fields: [field] }, meta);
  const coalesce = `kind:${field.key}`;
  switch (field.type) {
    case "range": {
      const value = params[field.key] as number;
      return (
        <label className="block space-y-1">
          <span className="flex items-center justify-between">
            <span className={MICRO}>{labelOf(field)}</span>
            <span className="text-cyan-200">
              {value.toFixed(field.step !== undefined && field.step >= 1 ? 0 : 2)}
              {field.unit ?? ""}
            </span>
          </span>
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? (field.max - field.min) / 100}
            value={value}
            className="w-full accent-emerald-400"
            onChange={(event) => onMeta({ [field.key]: Number(event.target.value) }, coalesce)}
          />
        </label>
      );
    }
    case "number": {
      const value = params[field.key] as number;
      return (
        <label className="flex items-center justify-between gap-2">
          <span className={MICRO}>{labelOf(field)}</span>
          <input
            type="number"
            step={field.step ?? 1}
            className={`w-32 ${INPUT}`}
            value={value}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) onMeta({ [field.key]: next }, coalesce);
            }}
          />
        </label>
      );
    }
    case "bool": {
      const value = params[field.key] as boolean;
      return (
        <label className="flex items-center gap-1.5 text-[10px] text-neutral-400">
          <input type="checkbox" className="accent-emerald-400" checked={value} onChange={(event) => onMeta({ [field.key]: event.target.checked }, coalesce)} />
          {labelOf(field)}
        </label>
      );
    }
    case "select": {
      const value = params[field.key] as string;
      return (
        <label className="flex items-center justify-between gap-2">
          <span className={MICRO}>{labelOf(field)}</span>
          <select className={`w-32 ${INPUT}`} value={value} onChange={(event) => onMeta({ [field.key]: event.target.value }, coalesce)}>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label ?? option.value}
              </option>
            ))}
          </select>
        </label>
      );
    }
    case "color": {
      const value = params[field.key] as string;
      return (
        <label className="flex items-center justify-between gap-2">
          <span className={MICRO}>{labelOf(field)}</span>
          <input
            type="color"
            className={`h-7 w-14 cursor-pointer rounded-[5px] border border-white/10 bg-black/40 ${FOCUS_RING}`}
            value={value}
            onChange={(event) => onMeta({ [field.key]: event.target.value }, coalesce)}
          />
        </label>
      );
    }
    case "text": {
      const value = params[field.key] as string;
      return (
        <label className="flex items-center justify-between gap-2">
          <span className={MICRO}>{labelOf(field)}</span>
          <input className={`w-32 min-w-0 ${INPUT}`} value={value} onChange={(event) => onMeta({ [field.key]: event.target.value }, coalesce)} />
        </label>
      );
    }
    case "seed": {
      const value = params[field.key] as string;
      return (
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className={MICRO}>{labelOf(field)}</span>
            <input className={`w-full min-w-0 ${INPUT}`} value={value} placeholder="reroll…" onChange={(event) => onMeta({ [field.key]: event.target.value }, coalesce)} />
          </label>
          <button
            type="button"
            className={BTN}
            title="Reroll seed"
            onClick={() => onMeta({ [field.key]: `r${Math.abs(Math.round((value.length + 1) * 2654435761)).toString(36).slice(0, 6)}${value.length}` }, coalesce)}
          >
            ⟳
          </button>
        </div>
      );
    }
    case "weightedList": {
      const list = params[field.key] as WeightedParamEntry[];
      const set = (next: WeightedParamEntry[]) => onMeta({ [field.key]: next }, coalesce);
      return (
        <div className="space-y-1">
          <div className={MICRO}>{labelOf(field)}</div>
          {list.map((entry, index) => (
            <div key={index} className="flex items-center gap-1">
              <input className={`min-w-0 flex-1 ${INPUT}`} value={entry.item} placeholder={field.itemLabel ?? "id"} onChange={(event) => set(list.map((e, i) => (i === index ? { ...e, item: event.target.value } : e)))} />
              <input type="number" step={1} min={0} className={`w-14 ${INPUT}`} value={entry.weight} onChange={(event) => set(list.map((e, i) => (i === index ? { ...e, weight: Math.max(0, Number(event.target.value)) } : e)))} />
              <button type="button" className={`${CONTROL} px-1.5 py-1 text-neutral-400 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40`} disabled={list.length <= 1} onClick={() => set(list.filter((_, i) => i !== index))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className={`w-full ${BTN}`} onClick={() => set([...list, { item: "", weight: 1 }])}>
            + row
          </button>
        </div>
      );
    }
    case "action":
      return null; // Action buttons are rendered by the group section, which owns the whole schema.
  }
}

/** A schema action button (randomize / reset a group) — computed patches from the core helpers. */
function ActionButton({ field, schema, onMeta }: { field: Extract<ParamField, { type: "action" }>; schema: ParamSchema; onMeta: MetaPatch }) {
  const run = () =>
    onMeta(
      field.action === "randomize" ? randomizeGroupParams(schema, field.group, Math.random) : resetGroupParams(schema, field.group),
      `${field.action}:${field.group ?? "all"}`,
    );
  return (
    <button
      type="button"
      className={`w-full ${BTN} font-medium`}
      onClick={run}
    >
      {field.action === "randomize" ? "🎲 " : "↺ "}
      {labelOf(field)}
    </button>
  );
}

/** A collapsible group section: header (click to toggle) + its fields + any action buttons. */
function GroupSection({
  title,
  accent,
  fields,
  schema,
  meta,
  onMeta,
  defaultCollapsed,
}: {
  title: string;
  accent: string;
  fields: readonly ParamField[];
  schema: ParamSchema;
  meta: Record<string, unknown> | undefined;
  onMeta: MetaPatch;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={`rounded-[6px] border ${BORDER}`}>
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-300 transition-colors hover:bg-white/[0.04]"
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="text-neutral-500">{collapsed ? "▸" : "▾"}</span>
        <span style={{ color: accent }}>{title}</span>
      </button>
      {collapsed ? null : (
        <div className="space-y-2 px-2 pb-2">
          {fields.map((field) =>
            field.type === "action" ? (
              <ActionButton key={field.key} field={field} schema={schema} onMeta={onMeta} />
            ) : (
              <FieldRow key={field.key} field={field} meta={meta} onMeta={onMeta} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders any parameter schema as an inspector panel — one row per field
 * (range/number/bool/select/color/text/seed/weighted-list) plus an optional `note` readout. Fully
 * schema-driven: a new studio or asset generator needs no new JSX here. Drives both registered scene
 * kinds (scatter, water, poles) and generator assets (building, bookcase) — the proof that the #809
 * seam owns the inspector. Replaces the hand-written per-kind field blocks (`ScatterFields`).
 * @internal — mounted by `EditorChrome`'s inspector; not a game-author entry point.
 */
export function SchemaInspector({
  schema,
  label,
  accent = "#34d399",
  note,
  meta,
  onMeta,
  hideKeys,
}: {
  schema: ParamSchema;
  label: string;
  accent?: string;
  note?: string;
  meta: Record<string, unknown> | undefined;
  onMeta: MetaPatch;
  /** Field keys to omit from this body — hoisted elsewhere (e.g. the density slider in `CoverageSection`). */
  hideKeys?: readonly string[];
}) {
  const groups = schema.groups ?? [];
  const grouped = new Set(groups.map((group) => group.id));
  const hidden = hideKeys === undefined || hideKeys.length === 0 ? null : new Set(hideKeys);
  const visible = hidden === null ? schema.fields : schema.fields.filter((field) => !hidden.has(field.key));
  // Fields with no group (or a group not declared in schema.groups) render first, headerless.
  const ungrouped = visible.filter((field) => field.group === undefined || !grouped.has(field.group));
  return (
    <div className="space-y-2 rounded-lg border p-2.5" style={{ borderColor: `${accent}26`, backgroundColor: `${accent}10` }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
        {label}
      </div>
      <PresetRow schema={schema} onMeta={onMeta} />
      {ungrouped.map((field) =>
        field.type === "action" ? (
          <ActionButton key={field.key} field={field} schema={schema} onMeta={onMeta} />
        ) : (
          <FieldRow key={field.key} field={field} meta={meta} onMeta={onMeta} />
        ),
      )}
      {groups
        .map((group) => ({ group, fields: visible.filter((field) => field.group === group.id) }))
        .filter((entry) => entry.fields.length > 0)
        .map(({ group, fields }) => (
        <GroupSection
          key={group.id}
          title={group.label}
          accent={accent}
          fields={fields}
          schema={schema}
          meta={meta}
          onMeta={onMeta}
          defaultCollapsed={group.collapsed ?? false}
        />
      ))}
      {note !== undefined && note.length > 0 ? <div className="text-[10px] text-neutral-500">{note}</div> : null}
    </div>
  );
}
