/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";

import { session } from "../../session";
import { Button, GOLD, INK, PENCIL, Row, Tag, Text } from "../look";

/**
 * The park's settings: Reduce motion, then the engine's sound, graphics and control rows composed as
 * fair tickets. A slider drags or steps with left/right; a keybind arms and takes the next key.
 */
export function ParkSettings({ reducedMotion, onReducedMotion }: { reducedMotion: boolean; onReducedMotion: (next: boolean) => void }) {
  const settings = useSettings(), [chosen, setChosen] = useState<string | null>(null), [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find((c) => c.id === chosen) ?? settings.categories[0];
  return <RuneView gap={10} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find((k) => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <Row justify="between"><RuneView gap={1} grow={1} shrink><Text weight={800}>Reduce motion</Text><Text size={12} color={PENCIL}>Stills the ride mechanisms and the board's own motion.</Text></RuneView>
      <Button pressed={reducedMotion} label="Reduce motion" onPress={() => onReducedMotion(!reducedMotion)}>{reducedMotion ? "On" : "Off"}</Button></Row>
    {settings.categories.length === 0 ? null : <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 3 } }} gap={4} label="Settings categories">
      {settings.categories.map((c) => <Button key={c.id} tone="ghost" pressed={c === active} minHeight={32} padding={[4, 6, 4, 6]} onPress={() => setChosen(c.id)}><Text size={13} weight={800}>{c.label}</Text></Button>)}
    </RuneView>}
    {active?.rows.map((row) => <Setting key={row.id} row={row} />)}
    {active?.keybinds.map((k) => <Row key={k.action} justify="between"><Text grow={1} shrink>{k.label}</Text>
      <Button disabled={k.locked === true} minHeight={32} onPress={() => setArmed(k.action)}>{armed === k.action ? "Press a key · Esc cancels" : k.bindingLabel}</Button>
      <Button tone="ghost" minHeight={32} disabled={k.locked === true || k.isDefault} onPress={k.reset}>Reset</Button></Row>)}
    {settings.actions.map((a) => <Button key={a.id} onPress={a.run}>{a.label}</Button>)}
    <Tag>{`${session.saveStatus}. Saves stay in this browser.`.toUpperCase()}</Tag>
  </RuneView>;
}

function Setting({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1, fraction = useRef(0);
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const shown = row.kind === "toggle" ? row.value ? "On" : "Off" : row.options?.find((o) => o.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  const value = () => min + fraction.current * (max - min);
  return <RuneView gap={4}>
    <Row justify="between"><Text grow={1} shrink>{row.label}</Text><Text weight={800} color={INK} text={row.kind === "slider" ? bind(() => row.format?.(value()) ?? value().toFixed(2)) : shown} /></Row>
    {row.kind !== "slider" ? <Button label={row.label} minHeight={32} onPress={() => adjust(1)}>{`${shown} ›`}</Button>
      : <RuneAction label={row.label} height={30} fill="#e3d3ab" radius={8} padding={[11, 0, 11, 0]} border={{ width: 2, color: INK }} onAdjust={adjust} onDrag={(d) => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min); return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        if (d.phase === "up") { const step = row.step ?? 1; row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / step) * step))); }
      }}><RuneView height={8} radius={4} fill={GOLD} width={bind(() => ({ fraction: Math.max(0, Math.min(1, fraction.current)) }))} /></RuneAction>}
  </RuneView>;
}
