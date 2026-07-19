import { scatterFootprintArea } from "@jgengine/core/world/scatterCoverage";
import type {
  ParamField,
  ParamSchema,
  ParsedParams,
  SceneKindCoverage,
  SceneKindObject,
  WeightedParamEntry,
} from "@jgengine/core/scene/sceneKinds";
import { useDebouncedCommit } from "@jgengine/react/useDebouncedCommit";

import { MICRO_LABEL } from "./theme";

/** A patch to a single meta key, coalesced under a stable undo key (matches `SchemaInspector`). */
type MetaPatch = (patch: Record<string, unknown>, coalesce: string) => void;

const fmt = (n: number): string => Math.round(n).toLocaleString();

/**
 * The hoisted density slider: live-mirrored thumb + readout, debounced commit flushed on release
 * (#1372). Scatter/grass/city regen is heavy, so one write per pause instead of ~50 per drag.
 */
function CoverageDensitySlider({
  field,
  density,
  densityKey,
  onMeta,
}: {
  field: Extract<ParamField, { type: "range" }>;
  density: number;
  densityKey: string;
  onMeta: MetaPatch;
}) {
  const { value: local, onInput, flush } = useDebouncedCommit(density, (next) => onMeta({ [densityKey]: next }, `kind:${densityKey}`));
  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between">
        <span className={MICRO_LABEL}>{field.label ?? field.key}</span>
        <span className="text-cyan-200">
          {local.toFixed(field.step !== undefined && field.step >= 1 ? 0 : 2)}
          {field.unit ?? ""}
        </span>
      </span>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step ?? (field.max - field.min) / 100}
        value={local}
        className="w-full accent-emerald-400"
        aria-label={`${field.label ?? field.key} density`}
        onChange={(event) => onInput(Number(event.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
      />
    </label>
  );
}

/** One-line summary of a weighted "what fills it" palette: count + the leading item ids. */
function assetsSummary(entries: readonly WeightedParamEntry[] | undefined): string | null {
  if (entries === undefined || entries.length === 0) return null;
  const ids = entries.map((entry) => entry.item).filter((item) => item.length > 0);
  if (ids.length === 0) return null;
  const head = ids.slice(0, 4).join(", ");
  const rest = ids.length > 4 ? ` +${ids.length - 4}` : "";
  return `${ids.length} ${ids.length === 1 ? "type" : "types"} · ${head}${rest}`;
}

/**
 * The shared leading block for every scatterable kind (`grass_field` / `scatter` / `city`): one
 * consistent Area → Assets → Density gesture. Renders the footprint Area readout, a compact summary
 * of what fills it (the weighted palette, when the kind declares one), the single Density slider
 * hoisted out of the schema body, and the kind's budget clamp-and-warn `note`. The rest of the kind's
 * parameters render below via `SchemaInspector` (with the density key hidden). One module so grass,
 * scatter, and city never re-derive the "how much stuff grows here" affordance.
 * @internal — mounted by `InspectorPanel`'s `KindInspector` when a kind declares `coverage`.
 */
export function CoverageSection({
  schema,
  coverage,
  object,
  params,
  note,
  accent,
  onMeta,
}: {
  schema: ParamSchema;
  coverage: SceneKindCoverage;
  object: SceneKindObject;
  params: ParsedParams;
  note?: string;
  accent: string;
  onMeta: MetaPatch;
}) {
  const area = scatterFootprintArea(object);
  const densityField = schema.fields.find((field) => field.key === coverage.densityKey);
  const density = typeof params[coverage.densityKey] === "number" ? (params[coverage.densityKey] as number) : 0;
  const assets = coverage.assetsKey === undefined ? null : assetsSummary(params[coverage.assetsKey] as WeightedParamEntry[] | undefined);

  return (
    <div className="space-y-2 rounded-lg border p-2.5" style={{ borderColor: `${accent}26`, backgroundColor: `${accent}10` }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
        Coverage
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={MICRO_LABEL}>area</span>
        <span className="text-cyan-200">{area > 0 ? `${fmt(area)} m²` : "—"}</span>
      </div>
      {assets !== null ? (
        <div className="flex items-center justify-between gap-2">
          <span className={MICRO_LABEL}>fills with</span>
          <span className="min-w-0 truncate text-right text-[10px] text-neutral-300" title={assets}>
            {assets}
          </span>
        </div>
      ) : null}
      {densityField !== undefined && densityField.type === "range" ? (
        <CoverageDensitySlider field={densityField} density={density} densityKey={coverage.densityKey} onMeta={onMeta} />
      ) : null}
      {note !== undefined && note.length > 0 ? <div className="text-[10px] text-neutral-500">{note}</div> : null}
    </div>
  );
}
