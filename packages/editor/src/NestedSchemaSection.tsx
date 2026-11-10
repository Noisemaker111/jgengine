/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ParamSchema } from "@jgengine/core/generator/paramSchema";

import { SchemaInspector } from "./SchemaInspector";
import { CONTROL } from "./shell/theme";

/**
 * A settings bag that lives as one nested object (a world's `grassStyle`, a grass patch's `style`)
 * rather than as top-level meta fields, shown through its schema. The sliders show the values in
 * effect, including ones nothing sets by hand (a realism curve's), and each edit writes only the key
 * it touched, so an untouched slider keeps following its curve. Clear removes the whole bag.
 */
export function NestedSchemaSection({
  schema,
  label,
  accent,
  note,
  authored,
  effective,
  onChange,
}: {
  schema: ParamSchema;
  label: string;
  accent?: string;
  note?: string;
  /** The bag as authored; `undefined` when nothing is set here. */
  authored: Readonly<Record<string, unknown>> | undefined;
  /** Every field's value in effect, shown on the sliders. */
  effective: Readonly<Record<string, unknown>>;
  onChange: (next: Record<string, unknown> | undefined, coalesce: string) => void;
}) {
  const presetKey = schema.presetKey;
  const preset = presetKey === undefined ? undefined : authored?.[presetKey];
  // The effective values already include the preset's, so the named preset only marks the choice.
  const display = { ...effective, ...(presetKey === undefined || preset === undefined ? {} : { [presetKey]: preset }) };
  return (
    <div className="space-y-1">
      <SchemaInspector
        schema={schema}
        label={label}
        {...(accent === undefined ? {} : { accent })}
        note={authored === undefined ? `${note ?? ""}${note === undefined ? "" : " "}Nothing set here; edit a slider to set it.` : note}
        meta={display}
        onMeta={(patch, coalesce) => onChange({ ...(authored ?? {}), ...patch }, coalesce)}
      />
      {authored === undefined ? null : (
        <button type="button" className={`${CONTROL} px-2 py-1 text-[10px]`} title={`Remove every ${label.toLowerCase()} setting set here`} onClick={() => onChange(undefined, `clear:${label}`)}>
          Clear {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
