/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { SettingsCategoryView, SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";

import { Button, C, FULL, Label, Muted, Panel, Row, Text } from "../../ui/kit";
import { keybindRebindSession, keybindsFromSession } from "../keybinds";
import { updateAppSettings, useAppSettings } from "../settings";
import { SETTINGS_CREDITS } from "../credits";

/** LLMville's own tabs after the shell's categories. */
export const KEYBINDS_TAB = "keybinds";
export const CREDITS_TAB = "credits";

/** One shell setting: a draggable bar for sliders (left/right adjust it), a cycling button otherwise. */
function SettingRowView({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1;
  const fraction = useRef(0);
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const value = () => min + fraction.current * (max - min);
  const shown = row.kind === "toggle" ? (row.value ? "On" : "Off") : row.options?.find((option) => option.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  return <RuneView gap={6} width={FULL}>
    <Row justify="between" width={FULL}>
      <Text size={14} weight={700} grow={1}>{row.label}</Text>
      {row.kind === "slider" ? <Text size={13} weight={800} color={C.teal} text={bind(() => row.format?.(value()) ?? value().toFixed(2))} /> : null}
    </Row>
    {row.kind === "slider"
      ? <RuneAction label={row.label} height={30} padding={[11, 0, 11, 0]} fill="#00000040" radius={15} onAdjust={adjust} onDrag={(drag) => {
        if (drag.cancelled) { fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min); return; }
        fraction.current = Math.max(0, Math.min(1, drag.x / Math.max(1, drag.width)));
        if (drag.phase === "up") { const step = row.step ?? 0.01; row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / step) * step))); }
      }}>
        <RuneView height={8} radius={4} fill={C.teal} width={bind(() => ({ fraction: Math.max(0.02, fraction.current) }))} />
      </RuneAction>
      : <Button tone="secondary" label={`${row.label}: ${shown}`} onPress={() => adjust(1)} onAdjust={adjust}>{`${shown}  ›`}</Button>}
  </RuneView>;
}

/** Every LLMville action, rebindable: press a row, then the key. Escape cancels; the saved keybinds update at once. */
export function KeybindsPanel() {
  const { keybinds } = useAppSettings();
  const session = useMemo(() => keybindRebindSession(keybinds), [keybinds]);
  const [, redraw] = useState(0);
  useEffect(() => session.subscribe(() => redraw((n) => n + 1)), [session]);
  const armed = session.capturingActionId();
  const save = () => updateAppSettings({ keybinds: keybindsFromSession(session) });
  return <RuneView gap={6} width={FULL} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code === "Escape") session.cancelCapture();
    else if (session.capture(code)) save();
  } })}>
    {session.rows().map((row) => <Row key={row.actionId} justify="between" width={FULL} padding={[4, 0, 4, 0]}>
      <RuneView grow={1} shrink gap={2}>
        <Text size={14} weight={700}>{row.label}</Text>
        {row.conflictWith.length === 0 ? null : <Text size={11} color={C.error}>{`Also used by ${row.conflictWith.join(", ")}`}</Text>}
      </RuneView>
      <Button tone={armed === row.actionId ? "primary" : "secondary"} minWidth={96} disabled={row.locked} label={`Rebind ${row.label}`} onPress={() => session.beginCapture(row.actionId)}>
        {armed === row.actionId ? "Press a key" : row.bindingLabel || "Unbound"}
      </Button>
      <Button tone="ghost" disabled={row.locked || row.isDefault} label={`Reset ${row.label}`} onPress={() => { session.reset(row.actionId); save(); }}>Reset</Button>
    </Row>)}
    <Muted size={12}>{armed === null ? "Press a binding to change it." : "Press the new key, or Escape to cancel."}</Muted>
  </RuneView>;
}

function CreditsPanel() {
  return <RuneView gap={12} width={FULL}>
    <Panel shell="inset" padding={0} gap={0} width={FULL}>
      {SETTINGS_CREDITS.map(({ role, name }) => <Row key={role} justify="between" padding={[12, 16, 12, 16]} width={FULL}>
        <Label size={10}>{role.toUpperCase()}</Label>
        <Text size={13} weight={700} color={C.muted}>{name}</Text>
      </Row>)}
    </Panel>
    <Muted size={12} align="center">Build something great.</Muted>
  </RuneView>;
}

/**
 * LLMville's settings on the native surface: the shell's categories (sound, graphics, gameplay,
 * accessibility), then the game's keybinds and credits, under one tab rail.
 */
export function SettingsPanel({ categories, initialTab, onTabChange }: {
  categories: readonly SettingsCategoryView[]; initialTab?: string | undefined; onTabChange?: ((tab: string) => void) | undefined;
}) {
  const tabs = useMemo(() => [...categories.map(({ id, label }) => ({ id, label })), { id: KEYBINDS_TAB, label: "Keybinds" }, { id: CREDITS_TAB, label: "Credits" }], [categories]);
  const [active, setActive] = useState(() => tabs.find((tab) => tab.id === initialTab)?.id ?? tabs[0]?.id ?? KEYBINDS_TAB);
  const category = categories.find((candidate) => candidate.id === active);
  return <RuneView gap={14} width={FULL}>
    <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 3 } }} gap={6} width={FULL}>
      {tabs.map((tab) => <Button key={tab.id} tone="chip" justify="center" {...(tab.id === active ? { fill: C.coral, color: C.ink } : {})} label={`${tab.label} settings`} onPress={() => { setActive(tab.id); onTabChange?.(tab.id); }}>
        <Text size={13} weight={800} color={tab.id === active ? C.ink : C.cream}>{tab.label}</Text>
      </Button>)}
    </RuneView>
    {category === undefined ? null : <RuneView gap={14} width={FULL}>{category.rows.map((row) => <SettingRowView key={row.id} row={row} />)}</RuneView>}
    {active === KEYBINDS_TAB ? <KeybindsPanel /> : null}
    {active === CREDITS_TAB ? <CreditsPanel /> : null}
  </RuneView>;
}
