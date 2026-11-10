import type { SettingKind, SettingOption, SettingValue } from "./settingsModel";

/**
 * Step a slider within its bounds, flip a toggle or cycle a selection.
 * @capability adjust-setting-row step a settings row value once, for keyboard and gamepad alike
 */
export function adjustSettingRow(row: { kind: SettingKind; value: SettingValue; min?: number | undefined; max?: number | undefined; step?: number | undefined; options?: readonly SettingOption[] | undefined }, delta: -1 | 1): SettingValue | undefined {
  if (row.kind === "toggle") return !Boolean(row.value);
  if (row.kind === "select") {
    const options = row.options ?? [];
    if (options.length === 0) return undefined;
    const current = options.findIndex(option => option.value === String(row.value));
    const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
    return options[(base + delta + options.length) % options.length]?.value;
  }
  if (row.kind !== "slider") return undefined;
  const step = row.step ?? 1;
  const min = row.min ?? Number.NEGATIVE_INFINITY;
  const max = row.max ?? Number.POSITIVE_INFINITY;
  const next = Math.min(max, Math.max(min, Number(row.value) + step * delta));
  return Math.round(next * 1e6) / 1e6;
}
