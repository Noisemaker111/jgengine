import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameIcon } from "@jgengine/react/gameIcons";
import { GameSlider } from "@jgengine/react/gameSlider";
import { useMenuNav } from "@jgengine/react/menuNav";
import { useSettings, type SettingsKeybindRow, type SettingsRow } from "@jgengine/react/settings";
import { adjustSettingRow } from "@jgengine/react/settingsBlocks";
import { Enamel, navItem } from "./kit";

export interface HousePreference {
  id: string;
  label: string;
  on: boolean;
  set: (on: boolean) => void;
}

const TABS = "tabs";
const ROW = "row:";
const KEY = "key:";
const PREF = "pref:";

/**
 * The house controls, written on a handbook page: category tabs as sticky tabs, each setting as one
 * line with a drawn slider, a lamp switch or a row of little enamel chips. Keyboard and gamepad move
 * line to line, left/right change the value (or the tab on the tab line), and back leaves the page.
 */
export function HouseSettings({ active, onBack, preferences = [] }: { active: boolean; onBack: () => void; preferences?: readonly HousePreference[] }): ReactNode {
  const settings = useSettings();
  const categories = settings.categories;
  const [chosen, setChosen] = useState<string | null>(null);
  const category = categories.find((c) => c.id === chosen) ?? categories[0] ?? null;
  const [armed, setArmed] = useState<string | null>(null);
  const armedRef = useRef<string | null>(null);
  const arm = useCallback((action: string | null) => { armedRef.current = action; setArmed(action); }, []);
  const rows = category?.rows ?? [];
  const keybinds = category?.keybinds ?? [];
  const showPrefs = category !== null && category.id === categories[0]?.id;
  const ids = useMemo(() => [
    TABS,
    ...(showPrefs ? preferences.map((p) => `${PREF}${p.id}`) : []),
    ...rows.map((row) => `${ROW}${row.id}`),
    ...keybinds.map((row) => `${KEY}${row.action}`),
  ], [rows, keybinds, preferences, showPrefs]);
  const cycleTab = (delta: -1 | 1) => {
    if (categories.length === 0 || category === null) return;
    const index = categories.findIndex((c) => c.id === category.id);
    setChosen(categories[(index + delta + categories.length) % categories.length]!.id);
  };
  const adjust = (id: string, delta: -1 | 1) => {
    if (id === TABS) { cycleTab(delta); return; }
    if (id.startsWith(PREF)) { const pref = preferences.find((p) => `${PREF}${p.id}` === id); pref?.set(!pref.on); return; }
    const row = rows.find((r) => `${ROW}${r.id}` === id);
    if (row === undefined) return;
    const next = adjustSettingRow(row, delta);
    if (next !== undefined) row.set(next);
  };
  const confirm = (id: string) => {
    if (id === TABS) { cycleTab(1); return; }
    if (id.startsWith(KEY)) { arm(id.slice(KEY.length)); return; }
    if (id.startsWith(PREF)) { adjust(id, 1); return; }
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

  if (category === null) return <p className="orbit-settings-empty">This house has no settings to change.</p>;
  return (
    <div className="orbit-settings" {...nav.containerProps}>
      <div className="orbit-settings-tabs" role="tablist" aria-label="Settings pages" {...navItem(nav.itemProps(TABS))}>
        {categories.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === category.id} data-settings-tab={c.id} tabIndex={-1} onClick={() => setChosen(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="orbit-settings-lines" ref={list}>
        {showPrefs && preferences.map((pref) => (
          <div key={pref.id} className="orbit-line" {...navItem(nav.itemProps(`${PREF}${pref.id}`))}>
            <span>{pref.label}</span>
            <LampSwitch on={pref.on} label={pref.label} onToggle={() => pref.set(!pref.on)} />
          </div>
        ))}
        {rows.map((row) => <SettingLine key={row.id} row={row} itemProps={nav.itemProps(`${ROW}${row.id}`)} />)}
        {keybinds.map((row) => (
          <KeyLine key={row.action} row={row} armed={armed === row.action} onArm={() => arm(row.action)} itemProps={nav.itemProps(`${KEY}${row.action}`)} />
        ))}
        <GameCursor variant="chevron" color="#c2477f" gap={4} />
      </div>
    </div>
  );
}

type ItemProps = ReturnType<ReturnType<typeof useMenuNav>["itemProps"]>;

function SettingLine({ row, itemProps }: { row: SettingsRow; itemProps: ItemProps }): ReactNode {
  return (
    <div className="orbit-line" data-settings-row="" {...navItem(itemProps)}>
      <span>{row.label}</span>
      {row.kind === "slider" ? <SliderControl row={row} />
        : row.kind === "toggle" ? <LampSwitch on={Boolean(row.value)} label={row.label} onToggle={() => row.set(!row.value)} />
          : (
            <span className="orbit-chips" role="group" aria-label={row.label}>
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
    <span className="orbit-slider">
      <GameSlider value={local} min={row.min ?? 0} max={row.max ?? 100} step={row.step ?? 1} label={row.label} valueText={readout} onChange={setLocal} onCommit={() => row.set(local)} />
      <b>{readout}</b>
    </span>
  );
}

/** A household lamp switch: the lamp lights when the setting is on. */
export function LampSwitch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }): ReactNode {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} tabIndex={-1} className="orbit-lamp" data-on={on ? "" : undefined} onClick={onToggle}>
      <i aria-hidden="true" />{on ? "On" : "Off"}
    </button>
  );
}

function KeyLine({ row, armed, onArm, itemProps }: { row: SettingsKeybindRow; armed: boolean; onArm: () => void; itemProps: ItemProps }): ReactNode {
  return (
    <div className="orbit-line" data-settings-keybind={row.action} {...navItem(itemProps)}>
      <span>{row.label}</span>
      <span className="orbit-keyline">
        <Enamel as="button" tone={armed ? "pink" : "cream"} radius={8} padding="4px 12px" tabIndex={-1} onClick={onArm} aria-label={`Rebind ${row.label}`}>
          <span className="orbit-keycap">{armed ? "Press a key" : row.bindingLabel}</span>
        </Enamel>
        {!row.isDefault && (
          <button type="button" className="orbit-key-reset" tabIndex={-1} aria-label={`Reset ${row.label}`} onClick={() => row.reset()}>
            <GameIcon name="rotateCcw" size={16} />
          </button>
        )}
      </span>
    </div>
  );
}
