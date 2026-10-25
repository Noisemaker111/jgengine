import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameIcon } from "@jgengine/react/gameIcons";
import { GameSlider } from "@jgengine/react/gameSlider";
import { useMenuNav, type MenuNavController } from "@jgengine/react/menuNav";
import { useSettings, type SettingsKeybindRow, type SettingsRow } from "@jgengine/react/settings";
import { adjustSettingRow } from "@jgengine/react/settingsBlocks";
import { HH, navItem, useMenuSound, useMoveTick } from "./kit";

const TABS = "tabs";
const ROW = "row:";
const KEY = "key:";

/** What the settings app hands back to the phone so the keypad can drive it. */
export interface SettingsPad {
  move: (direction: "up" | "down") => void;
  cycle: (delta: -1 | 1) => void;
  adjust: (delta: -1 | 1) => void;
  confirm: () => void;
}

/**
 * The phone's Settings app: one page per category picked on the top line (left/right), then each
 * setting as an LCD line — volume as signal-bar pips, switches as ON/OFF, choices as ◀ value ▶,
 * keys as a bracketed keycap you press to rebind. Keyboard, gamepad and the phone's d-pad move line to
 * line; left/right change the value; back leaves the app.
 */
export function PhoneSettings({ active, onBack, onPad }: { active: boolean; onBack: () => void; onPad?: (pad: SettingsPad | null) => void }): ReactNode {
  const settings = useSettings();
  const sound = useMenuSound();
  const categories = settings.categories;
  const [chosen, setChosen] = useState<string | null>(null);
  const category = categories.find((c) => c.id === chosen) ?? categories[0] ?? null;
  const [armed, setArmed] = useState<string | null>(null);
  const armedRef = useRef<string | null>(null);
  const arm = useCallback((action: string | null) => { armedRef.current = action; setArmed(action); }, []);
  const rows = category?.rows ?? [];
  const keybinds = category?.keybinds ?? [];
  const ids = useMemo(() => [TABS, ...rows.map((row) => `${ROW}${row.id}`), ...keybinds.map((row) => `${KEY}${row.action}`)], [rows, keybinds]);
  const cycleTab = (delta: -1 | 1) => {
    if (categories.length === 0 || category === null) return;
    const index = categories.findIndex((c) => c.id === category.id);
    setChosen(categories[(index + delta + categories.length) % categories.length]!.id);
    sound.play("move");
  };
  const adjust = (id: string, delta: -1 | 1) => {
    if (id === TABS) { cycleTab(delta); return; }
    const row = rows.find((r) => `${ROW}${r.id}` === id);
    if (row === undefined) return;
    const next = adjustSettingRow(row, delta);
    if (next !== undefined) { row.set(next); sound.play("move"); }
  };
  const confirm = (id: string) => {
    if (id === TABS) { cycleTab(1); return; }
    if (id.startsWith(KEY)) { arm(id.slice(KEY.length)); sound.play("confirm"); return; }
    const row = rows.find((r) => `${ROW}${r.id}` === id);
    if (row === undefined || row.kind === "slider") return;
    const next = adjustSettingRow(row, 1);
    if (next !== undefined) { row.set(next); sound.play("confirm"); }
  };
  const back = () => { sound.play("back"); onBack(); };
  const nav = useMenuNav({ ids, initialId: TABS, enabled: active && armed === null, onAdjust: adjust, onConfirm: confirm, onBack: back });
  useMoveTick(nav.activeId, active);

  // The keypad drives the same controller as the keyboard.
  const padRef = useRef<SettingsPad | null>(null);
  padRef.current = {
    move: (direction) => nav.move(direction),
    cycle: cycleTab,
    adjust: (delta) => { if (nav.activeId !== null) adjust(nav.activeId, delta); },
    confirm: () => { if (nav.activeId !== null) confirm(nav.activeId); },
  };
  useEffect(() => {
    onPad?.({
      move: (d) => padRef.current?.move(d),
      cycle: (d) => padRef.current?.cycle(d),
      adjust: (d) => padRef.current?.adjust(d),
      confirm: () => padRef.current?.confirm(),
    });
    return () => onPad?.(null);
  }, [onPad]);

  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nav.activeId === null) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-jg-menu-item="${CSS.escape(nav.activeId)}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [nav.activeId]);
  useEffect(() => {
    if (armed === null) return;
    const row = keybinds.find((r) => r.action === armed);
    if (row === undefined) { arm(null); return; }
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (armedRef.current !== row.action) return;
      arm(null);
      if (event.code !== "Escape") row.rebind(event.code);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [armed, arm, keybinds]);

  if (category === null) return <p className="hh-lcd-line">No settings on this handset.</p>;
  const index = categories.findIndex((c) => c.id === category.id);
  return (
    <div className="hh-set" data-harbor-settings="" {...nav.containerProps}>
      <div className="hh-set-tab" role="tablist" aria-label="Settings pages" {...navItem(nav.itemProps(TABS))}>
        <button type="button" tabIndex={-1} className="hh-set-arrow" aria-label="Previous page" onClick={() => cycleTab(-1)}><GameIcon name="arrowLeft" size={14} /></button>
        <span className="hh-set-tab-name" role="tab" aria-selected="true" data-settings-tab={category.id}>{category.label}</span>
        <span className="hh-set-tab-count">{index + 1}/{categories.length}</span>
        <button type="button" tabIndex={-1} className="hh-set-arrow" aria-label="Next page" onClick={() => cycleTab(1)}><GameIcon name="arrowRight" size={14} /></button>
      </div>
      <div className="hh-set-lines" ref={list}>
        {rows.map((row) => <SettingLine key={row.id} row={row} itemProps={nav.itemProps(`${ROW}${row.id}`)} />)}
        {keybinds.map((row) => (
          <KeyLine key={row.action} row={row} armed={armed === row.action} onArm={() => arm(row.action)} itemProps={nav.itemProps(`${KEY}${row.action}`)} />
        ))}
        <GameCursor variant="chevron" color={HH.lcdInk} gap={2} thickness={3} arm={10} />
      </div>
    </div>
  );
}

type ItemProps = ReturnType<MenuNavController["itemProps"]>;

function SettingLine({ row, itemProps }: { row: SettingsRow; itemProps: ItemProps }): ReactNode {
  return (
    <div className="hh-set-line" data-settings-row="" data-kind={row.kind} {...navItem(itemProps)}>
      <span className="hh-set-label">{row.label}</span>
      {row.kind === "slider" ? <SliderControl row={row} />
        : row.kind === "toggle" ? <Switch on={Boolean(row.value)} label={row.label} onToggle={() => row.set(!row.value)} />
          : <Choice row={row} />}
    </div>
  );
}

function SliderControl({ row }: { row: SettingsRow }): ReactNode {
  const [local, setLocal] = useState(Number(row.value));
  useEffect(() => setLocal(Number(row.value)), [row.value]);
  const readout = row.format?.(local) ?? String(local);
  return (
    <span className="hh-set-slider">
      <GameSlider variant="pips" pips={10} value={local} min={row.min ?? 0} max={row.max ?? 100} step={row.step ?? 1} label={row.label} valueText={readout} onChange={setLocal} onCommit={() => row.set(local)} />
      <b>{readout}</b>
    </span>
  );
}

/** ON/OFF as two printed segments; the lit one is inverted. */
function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} tabIndex={-1} className="hh-set-switch" data-on={on ? "" : undefined} onClick={onToggle}>
      <span data-lit={on ? undefined : ""}>OFF</span>
      <span data-lit={on ? "" : undefined}>ON</span>
    </button>
  );
}

/** ◀ value ▶: tap an arrow or press left/right to step through the options. */
function Choice({ row }: { row: SettingsRow }): ReactNode {
  const options = row.options ?? [];
  const current = options.find((option) => String(option.value) === String(row.value));
  const step = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  return (
    <span className="hh-set-choice" role="group" aria-label={row.label}>
      <button type="button" tabIndex={-1} aria-label={`Previous ${row.label}`} onClick={() => step(-1)}><GameIcon name="arrowLeft" size={12} /></button>
      <b>{current?.label ?? String(row.value)}</b>
      <button type="button" tabIndex={-1} aria-label={`Next ${row.label}`} onClick={() => step(1)}><GameIcon name="arrowRight" size={12} /></button>
    </span>
  );
}

function KeyLine({ row, armed, onArm, itemProps }: { row: SettingsKeybindRow; armed: boolean; onArm: () => void; itemProps: ItemProps }): ReactNode {
  return (
    <div className="hh-set-line" data-kind="key" data-settings-keybind={row.action} {...navItem(itemProps)}>
      <span className="hh-set-label">{row.label}</span>
      <span className="hh-set-keyline">
        <button type="button" className="hh-set-key" data-armed={armed ? "" : undefined} tabIndex={-1} onClick={onArm} aria-label={`Rebind ${row.label}`}>
          {armed ? "PRESS A KEY" : row.bindingLabel}
        </button>
        {!row.isDefault && (
          <button type="button" className="hh-set-reset" tabIndex={-1} aria-label={`Reset ${row.label}`} onClick={() => row.reset()}>
            <GameIcon name="rotateCcw" size={12} />
          </button>
        )}
      </span>
    </div>
  );
}
