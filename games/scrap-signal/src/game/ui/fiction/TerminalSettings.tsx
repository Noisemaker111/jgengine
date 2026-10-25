import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameIcon } from "@jgengine/react/gameIcons";
import { GameSlider } from "@jgengine/react/gameSlider";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useSettings, type SettingsKeybindRow, type SettingsRow } from "@jgengine/react/settings";
import { adjustSettingRow } from "@jgengine/react/settingsBlocks";
import { navItem, SIGNAL } from "./kit";

const TABS = "tabs";
const ROW = "row:";
const KEY = "key:";

/**
 * The field terminal's setup page: pages as hardware keys along the screen's top lip, each setting
 * one phosphor line with a pip slider, a rocker or a row of bracketed options. Keyboard and gamepad
 * move line to line, left/right change the value (or the page on the key line), back leaves.
 */
export function TerminalSettings({ active, onBack }: { active: boolean; onBack: () => void }): ReactNode {
  const settings = useSettings();
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
  };
  const adjust = (id: string, delta: -1 | 1) => {
    if (id === TABS) { cycleTab(delta); return; }
    const row = rows.find((r) => `${ROW}${r.id}` === id);
    if (row === undefined) return;
    const next = adjustSettingRow(row, delta);
    if (next !== undefined) row.set(next);
  };
  const confirm = (id: string) => {
    if (id === TABS) { cycleTab(1); return; }
    if (id.startsWith(KEY)) { arm(id.slice(KEY.length)); return; }
    const row = rows.find((r) => `${ROW}${r.id}` === id);
    if (row === undefined || row.kind === "slider") return;
    const next = adjustSettingRow(row, 1);
    if (next !== undefined) row.set(next);
  };
  const nav = useMenuNav({ ids, enabled: active && armed === null, onAdjust: adjust, onConfirm: confirm, onBack });
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

  if (category === null) return <p className="ss-term-line">No settings on this unit.</p>;
  return (
    <div className="ss-settings" {...nav.containerProps}>
      <div className="ss-settings-tabs" role="tablist" aria-label="Settings pages" {...navItem(nav.itemProps(TABS))}>
        {categories.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === category.id} data-settings-tab={c.id} tabIndex={-1} onClick={() => setChosen(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="ss-settings-lines" ref={list}>
        {rows.map((row) => <SettingLine key={row.id} row={row} itemProps={nav.itemProps(`${ROW}${row.id}`)} />)}
        {keybinds.map((row) => (
          <KeyLine key={row.action} row={row} armed={armed === row.action} onArm={() => arm(row.action)} itemProps={nav.itemProps(`${KEY}${row.action}`)} />
        ))}
        <GameCursor variant="chevron" color={SIGNAL.amber} gap={4} thickness={3} />
      </div>
    </div>
  );
}

type ItemProps = ReturnType<ReturnType<typeof useMenuNav>["itemProps"]>;

function SettingLine({ row, itemProps }: { row: SettingsRow; itemProps: ItemProps }): ReactNode {
  return (
    <div className="ss-line" data-settings-row="" {...navItem(itemProps)}>
      <span className="ss-line-label">{row.label}</span>
      {row.kind === "slider" ? <SliderControl row={row} />
        : row.kind === "toggle" ? <Rocker on={Boolean(row.value)} label={row.label} onToggle={() => row.set(!row.value)} />
          : (
            <span className="ss-options" role="group" aria-label={row.label}>
              {(row.options ?? []).map((option) => (
                <button key={String(option.value)} type="button" tabIndex={-1} aria-pressed={String(row.value) === String(option.value)} onClick={() => row.set(option.value)}>{option.label}</button>
              ))}
            </span>
          )}
    </div>
  );
}

function SliderControl({ row }: { row: SettingsRow }): ReactNode {
  const [local, setLocal] = useState(Number(row.value));
  useEffect(() => setLocal(Number(row.value)), [row.value]);
  const readout = row.format?.(local) ?? String(local);
  return (
    <span className="ss-slider">
      <GameSlider variant="pips" pips={12} value={local} min={row.min ?? 0} max={row.max ?? 100} step={row.step ?? 1} label={row.label} valueText={readout} onChange={setLocal} onCommit={() => row.set(local)} />
      <b>{readout}</b>
    </span>
  );
}

/** A two-way rocker switch with a status lamp. */
function Rocker({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} tabIndex={-1} className="ss-rocker" data-on={on ? "" : undefined} onClick={onToggle}>
      <i aria-hidden="true" /><span>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function KeyLine({ row, armed, onArm, itemProps }: { row: SettingsKeybindRow; armed: boolean; onArm: () => void; itemProps: ItemProps }): ReactNode {
  return (
    <div className="ss-line" data-settings-keybind={row.action} {...navItem(itemProps)}>
      <span className="ss-line-label">{row.label}</span>
      <span className="ss-keyline">
        <button type="button" className="ss-keybind" data-armed={armed ? "" : undefined} tabIndex={-1} onClick={onArm} aria-label={`Rebind ${row.label}`}>
          {armed ? "PRESS A KEY" : row.bindingLabel}
        </button>
        {!row.isDefault && (
          <button type="button" className="ss-key-reset" tabIndex={-1} aria-label={`Reset ${row.label}`} onClick={() => row.reset()}>
            <GameIcon name="rotateCcw" size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
