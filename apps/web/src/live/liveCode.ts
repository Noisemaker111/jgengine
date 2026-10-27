/**
 * Shows a snippet with the demo's current settings written into it. The snippet file stays the
 * type-checked source; this only swaps the numbers and names a slider or toggle controls.
 */
export type DialValue = number | boolean | string;
export type DialSet = Readonly<Record<string, DialValue>>;

export interface LiveCodeSpec {
  /** Dial key -> the property name in the code whose number it sets (defaults to the dial key). */
  values?: Readonly<Record<string, { prop?: string; format?: (value: number) => string }>>;
  /** Text swaps: every `from` becomes `to(dials)`. Use for names (a style) and lines a toggle adds. */
  swaps?: readonly { from: string; to: (dials: DialSet) => string }[];
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return Math.abs(value) >= 1_000 ? value.toLocaleString("en-US").replace(/,/g, "_") : String(value);
  return String(Math.round(value * 1000) / 1000);
}

export function liveCode(code: string, dials: DialSet, spec: LiveCodeSpec | undefined): string {
  if (spec === undefined) return code;
  let out = code;
  for (const [key, rule] of Object.entries(spec.values ?? {})) {
    const value = dials[key];
    const prop = escape(rule.prop ?? key);
    if (typeof value === "number") {
      out = out.replace(new RegExp(`(\\b${prop}\\s*[:=]\\s*)-?[\\d_.]+`), `$1${(rule.format ?? formatNumber)(value)}`);
    } else if (typeof value === "string") {
      out = out.replace(new RegExp(`(\\b${prop}\\s*[:=]\\s*)"[^"]*"`), `$1"${value}"`);
    }
  }
  for (const swap of spec.swaps ?? []) out = out.split(swap.from).join(swap.to(dials));
  return out;
}
