/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";

import { FIRE, FULL, Plank, Row, Text } from "../look";

/**
 * The keep's settings cut into the stone tablet: category notches, one channel per row, sliders a
 * fire-lit groove, keybinds armed by a press and set by the next key. Every row writes straight to
 * the shell's settings store.
 */
export function StoneSettings() {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null), [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find((category) => category.id === chosen) ?? settings.categories[0];
  return <RuneView gap={10} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find((k) => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 2 } }} gap={6}>
      {settings.categories.map((category) => <Plank key={category.id} tone={category === active ? "enamel" : "plank"} minHeight={36} padding={[6, 8, 6, 8]} run={() => setChosen(category.id)}>{category.label}</Plank>)}
    </RuneView>
    {settings.actions.length === 0 ? null : <Row gap={6}>{settings.actions.map((action) => <Plank key={action.id} tone={action.kind === "danger" ? "enamel" : "plank"} run={action.run}>{action.label}</Plank>)}</Row>}
    {active?.rows.map((row) => <Setting key={row.id} row={row} />)}
    {active?.keybinds.map((k) => <Row key={k.action} justify="between" gap={6}>
      <Text grow={1} size={14}>{k.label}</Text>
      <Plank minHeight={32} padding={[4, 10, 4, 10]} disabled={k.locked === true} run={() => setArmed(k.action)}>{armed === k.action ? "Press a key / Esc" : k.bindingLabel}</Plank>
      <Plank minHeight={32} padding={[4, 10, 4, 10]} disabled={k.locked === true || k.isDefault} run={k.reset}>Reset</Plank>
    </Row>)}
  </RuneView>;
}

function Setting({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1;
  const fraction = useRef(0);
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const shown = row.kind === "toggle" ? (row.value ? "On" : "Off") : row.options?.find((option) => option.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  const value = () => min + fraction.current * (max - min);
  return <RuneView gap={4} padding={[6, 10, 6, 10]} fill="#00000030" radius={3}>
    <Row justify="between"><Text grow={1} size={14}>{row.label}</Text>
      <Text size={14} color={FIRE} text={row.kind === "slider" ? bind(() => row.format?.(value()) ?? value().toFixed(2)) : shown} /></Row>
    {row.kind !== "slider"
      ? <Plank minHeight={32} padding={[4, 10, 4, 10]} label={row.label} run={() => adjust(1)}>{`${shown} ›`}</Plank>
      : <RuneAction label={row.label} height={30} width={FULL} fill="#2a2622" radius={3} padding={[11, 0, 11, 0]} onAdjust={adjust} onDrag={(d) => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min); return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        const step = row.step ?? 0.01;
        if (d.phase === "up") row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / step) * step)));
      }}><RuneView height={8} radius={2} fill={FIRE} width={bind(() => ({ fraction: fraction.current }))} /></RuneAction>}
  </RuneView>;
}
