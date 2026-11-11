/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useSettings, type SettingsKeybindRow, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { LcdLine } from "./BurnerPhone";
import { LcdText, Row, useMenuSound } from "./kit";
import { HH } from "./theme";

const PIPS = 10;

/**
 * The phone's Settings app: one page per category picked on the top line, then each setting as an LCD
 * line: volume as pips, switches as ON/OFF, choices as ◀ value ▶, keys as a bracketed keycap you press
 * to rebind. Arrows, pad and the phone's softkeys move line to line; left/right change the value.
 */
export function PhoneSettings({ maxHeight }: { maxHeight: number }) {
  const settings = useSettings();
  const sound = useMenuSound();
  const categories = settings.categories;
  const [chosen, setChosen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const category = categories.find((c) => c.id === chosen) ?? categories[0] ?? null;
  if (category === null) return <LcdText text="No settings on this handset." />;
  const index = categories.findIndex((c) => c.id === category.id);
  const cycle = (delta: -1 | 1) => {
    setChosen(categories[(index + delta + categories.length) % categories.length]!.id);
    sound.play("move");
  };
  return (
    <RuneView gap={4} {...(armed === null ? {} : { onKey: (code: string) => {
      if (code !== "Escape") category.keybinds.find((k) => k.action === armed)?.rebind(code);
      setArmed(null);
    } })}>
      <Row justify="between" fill="#2a170418" padding={[2, 4, 2, 4]}>
        <RuneAction label="Previous page" run={() => cycle(-1)} padding={[2, 8, 2, 8]} hover="#2a170433" radius={3}><LcdText text="◀" /></RuneAction>
        <LcdText text={`${category.label.toUpperCase()}  ${index + 1}/${categories.length}`} />
        <RuneAction label="Next page" run={() => cycle(1)} padding={[2, 8, 2, 8]} hover="#2a170433" radius={3}><LcdText text="▶" /></RuneAction>
      </Row>
      <RuneView scroll maxHeight={maxHeight} gap={2}>
        {category.rows.map((row) => <SettingLine key={`${category.id}:${row.id}`} row={row} />)}
        {category.keybinds.map((row) => <KeyLine key={`${category.id}:${row.action}`} row={row} armed={armed === row.action} arm={() => { sound.play("confirm"); setArmed(row.action); }} />)}
      </RuneView>
    </RuneView>
  );
}

function SettingLine({ row }: { row: SettingsRow }) {
  const step = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  if (row.kind === "slider") return <SliderLine row={row} step={step} />;
  if (row.kind === "toggle") {
    const on = Boolean(row.value);
    return (
      <LcdLine label={row.label} run={() => row.set(!on)} onAdjust={() => row.set(!on)}>
        <LcdText text={row.label} grow={1} />
        <Row gap={0} border={{ width: 1, color: HH.lcdInk }}>
          <RuneView padding={[1, 5, 1, 5]} fill={on ? "#00000000" : HH.lcdInk}><LcdText size={11} color={on ? HH.lcdInk : HH.lcd} text="OFF" /></RuneView>
          <RuneView padding={[1, 5, 1, 5]} fill={on ? HH.lcdInk : "#00000000"}><LcdText size={11} color={on ? HH.lcd : HH.lcdInk} text="ON" /></RuneView>
        </Row>
      </LcdLine>
    );
  }
  const current = row.options?.find((option) => String(option.value) === String(row.value));
  return (
    <LcdLine label={row.label} run={() => step(1)} onAdjust={step}>
      <LcdText text={row.label} grow={1} />
      <LcdText text={`◀ ${current?.label ?? String(row.value)} ▶`} />
    </LcdLine>
  );
}

function SliderLine({ row, step }: { row: SettingsRow; step: (delta: -1 | 1) => void }) {
  const min = row.min ?? 0, max = row.max ?? 100;
  const span = Math.max(1e-6, max - min);
  const fraction = useRef((Number(row.value) - min) / span);
  fraction.current = (Number(row.value) - min) / span;
  const shown = () => min + fraction.current * span;
  return (
    <LcdLine label={row.label} onAdjust={step}>
      <LcdText text={row.label} grow={1} />
      <RuneAction label={`${row.label} level`} layout="row" gap={2} items="end" padding={[4, 2, 4, 2]} onAdjust={step} onDrag={(d) => {
        if (d.cancelled) { fraction.current = (Number(row.value) - min) / span; return; }
        fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
        if (d.phase === "up") { const unit = row.step ?? 1; row.set(Math.min(max, Math.max(min, min + Math.round((shown() - min) / unit) * unit))); }
      }}>
        {Array.from({ length: PIPS }, (_, i) => <RuneView key={i} width={5} height={4 + i} fill={bind(() => (fraction.current * PIPS > i + 0.01 ? HH.lcdInk : "#2a170430"))} />)}
      </RuneAction>
      <LcdText width={40} align="right" text={bind(() => row.format?.(shown()) ?? String(Math.round(shown())))} />
    </LcdLine>
  );
}

function KeyLine({ row, armed, arm }: { row: SettingsKeybindRow; armed: boolean; arm: () => void }) {
  return (
    <Row gap={4}>
      <LcdLine grow={1} label={`Rebind ${row.label}`} run={arm} disabled={row.locked === true}>
        <LcdText text={row.label} grow={1} />
        <RuneView padding={[1, 6, 1, 6]} fill={armed ? HH.lcdInk : "#00000000"} border={{ width: 1, color: HH.lcdInk }}>
          <LcdText size={12} color={armed ? HH.lcd : HH.lcdInk} text={armed ? "PRESS A KEY" : `[${row.bindingLabel}]`} />
        </RuneView>
      </LcdLine>
      {row.isDefault ? null : <RuneAction label={`Reset ${row.label}`} run={row.reset} padding={[4, 6, 4, 6]} hover="#2a170433" radius={3}><LcdText text="↺" /></RuneAction>}
    </Row>
  );
}
