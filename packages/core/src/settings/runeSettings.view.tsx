/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "../ui/jsx";
import { RuneBox, RuneButton, RuneRow, RuneSlider, RuneText } from "../ui/rune/elements.view";
import type { RuneElementProps } from "../ui/rune/element";
import type { SettingsCategoryView, SettingsRow } from "./settings.view";
import { adjustSettingRow } from "./settingAdjustment";

/** Settings controls drawn directly by Rune, backed by the shared settings controller. */
export function RuneSettingsSection({ category, ...skin }: { category: SettingsCategoryView } & RuneElementProps) {
  const [armed, setArmed] = useState<string | null>(null);
  return <RuneBox gap={12} {...skin} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") category.keybinds.find(row => row.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    {category.rows.map(row => <Setting key={row.id} row={row} />)}
    {category.keybinds.map(row => <RuneBox key={row.action} gap={5}>
      <RuneText>{row.label}</RuneText>
      <RuneRow gap={8}>
        <RuneButton padding={8} fill="#264047" disabled={row.locked === true} onPress={() => setArmed(row.action)} label={`Rebind ${row.label}`}><RuneText>{armed === row.action ? "Press a key / Escape cancels" : row.bindingLabel}</RuneText></RuneButton>
        <RuneButton padding={8} fill="#264047" disabled={row.locked || row.isDefault} onPress={row.reset}><RuneText>Reset</RuneText></RuneButton>
      </RuneRow>
    </RuneBox>)}
  </RuneBox>;
}

function Setting({ row }: { row: SettingsRow }) {
  const value = Number(row.value);
  const min = row.min ?? 0, max = row.max ?? 1;
  const shown = row.kind === "toggle" ? row.value ? "On" : "Off" : row.kind === "select" ? row.options?.find(option => option.value === row.value)?.label ?? String(row.value) : row.format?.(value) ?? String(value);
  return <RuneBox gap={5}>
    <RuneRow justify="between" gap={12}><RuneText grow={1}>{row.label}</RuneText><RuneText>{shown}</RuneText></RuneRow>
    {row.kind === "slider" ? <RuneSlider label={row.label} value={max <= min ? 0 : (value - min) / (max - min)} color="#9cddd1" onAdjust={delta => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); }} onCommit={fraction => {
      const step = row.step ?? 1;
      const next = Math.min(max, Math.max(min, min + Math.round(fraction * (max - min) / step) * step));
      row.set(next);
    }} /> :
      <RuneButton label={row.label} padding={8} fill="#264047" onPress={() => { const next = adjustSettingRow(row, 1); if (next !== undefined) row.set(next); }}><RuneText>{shown} ›</RuneText></RuneButton>}
  </RuneBox>;
}
