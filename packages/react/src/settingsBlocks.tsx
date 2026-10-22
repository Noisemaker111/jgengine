import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { hudSpace, hudType, hudTransition } from "./hudTokens";
import type { SettingsCategoryView, SettingsKeybindRow, SettingsRow } from "./settings";
import { ScrollRail } from "./scrollRail";
import { useDebouncedCommit } from "./useDebouncedCommit";

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: hudSpace("md"),
  padding: `${hudSpace("sm")} ${hudSpace("md")}`,
  borderRadius: 10,
  background: "var(--jg-surface-deep, rgba(255,255,255,0.04))",
  border: "1px solid var(--jg-edge, rgba(255,255,255,0.08))",
};

const labelStyle: CSSProperties = {
  fontSize: hudType("sm"),
  color: "var(--jg-text, #ececef)",
};

const valueStyle: CSSProperties = {
  fontSize: hudType("sm"),
  color: "var(--jg-text, #ececef)",
  fontVariantNumeric: "tabular-nums",
  minWidth: 48,
  textAlign: "right",
};

function RowShell({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div data-settings-row="" style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: hudSpace("sm"), minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * One slider row from a {@link SettingsRow}: mirrors the thumb locally and commits on release, so a
 * drag never storms the settings store or the graphics rebuild it drives.
 *
 * @capability settings-slider a settings slider row that mirrors locally and persists on release
 */
export function SettingsSlider({ row }: { row: SettingsRow }): ReactNode {
  const { value, onInput, flush } = useDebouncedCommit(Number(row.value), (next) => row.set(next));
  return (
    <RowShell label={row.label}>
      <input
        type="range"
        min={row.min}
        max={row.max}
        step={row.step}
        value={value}
        aria-label={row.label}
        onChange={(event) => onInput(Number(event.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
        style={{ flex: 1, minWidth: 120, accentColor: "var(--jg-accent, #6ee7a8)" }}
      />
      <span style={valueStyle}>{row.format?.(value) ?? String(value)}</span>
    </RowShell>
  );
}

/** One on/off row from a {@link SettingsRow}. */
export function SettingsToggle({ row }: { row: SettingsRow }): ReactNode {
  const on = Boolean(row.value);
  return (
    <RowShell label={row.label}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={row.label}
        onClick={() => row.set(!on)}
        style={{
          position: "relative",
          width: 48,
          height: 26,
          borderRadius: 999,
          border: "1px solid var(--jg-edge-bright, rgba(255,255,255,0.16))",
          background: on ? "var(--jg-accent, #6ee7a8)" : "var(--jg-surface-deep, rgba(15,18,24,0.9))",
          boxShadow: on ? "0 0 12px var(--jg-accent-glow, rgba(110,231,168,0.35))" : "none",
          cursor: "pointer",
          transition: hudTransition(["background", "box-shadow"]),
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: on ? 25 : 3,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--jg-text, #fff)",
            transition: hudTransition("left"),
          }}
        />
      </button>
    </RowShell>
  );
}

/** One choice row from a {@link SettingsRow}, rendered as a pressed-state option group. */
export function SettingsSelect({ row }: { row: SettingsRow }): ReactNode {
  const current = String(row.value);
  return (
    <RowShell label={row.label}>
      <div role="group" aria-label={row.label} style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 }}>
        {(row.options ?? []).map((option) => {
          const selected = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => row.set(option.value)}
              style={{
                minHeight: 30,
                padding: `0 ${hudSpace("sm")}`,
                borderRadius: 7,
                border: "1px solid transparent",
                background: selected ? "var(--jg-accent, #6ee7a8)" : "transparent",
                color: selected ? "var(--jg-surface-deep, #0b0b0f)" : "var(--jg-text-dim, #94a3a0)",
                fontSize: hudType("sm"),
                fontWeight: 600,
                cursor: "pointer",
                transition: hudTransition(["background", "color"]),
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </RowShell>
  );
}

/** Render the control a {@link SettingsRow} kind asks for. */
export function SettingsRowControl({ row }: { row: SettingsRow }): ReactNode {
  if (row.kind === "slider") return <SettingsSlider row={row} />;
  if (row.kind === "toggle") return <SettingsToggle row={row} />;
  return <SettingsSelect row={row} />;
}

/** One rebindable action row: current key glyph, armed-capture state and a reset button. */
export interface SettingsKeybindControlProps {
  row: SettingsKeybindRow;
  /** This row is waiting for a key. */
  armed?: boolean;
  /** Click on the binding — the caller arms capture. */
  onArm?: () => void;
  /** Props the caller can spread onto the binding button for focus tracking. */
  buttonProps?: Record<string, unknown>;
}

/**
 * A controls row for one action: its label, the bound key (click to rebind), a conflict/armed state
 * and reset. The caller owns capture; this is the row's presentation.
 *
 * @capability settings-keybind-row one rebindable controls row — key glyph, armed state and reset
 */
export function SettingsKeybindControl({ row, armed = false, onArm, buttonProps }: SettingsKeybindControlProps): ReactNode {
  return (
    <div data-settings-keybind={row.action} data-armed={armed ? "" : undefined} style={rowStyle}>
      <span style={labelStyle}>{row.label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: hudSpace("xs") }}>
        <button
          type="button"
          data-settings-capture=""
          {...buttonProps}
          onClick={onArm}
          disabled={armed}
          title="Click, then press a key — Escape cancels"
          style={{
            minWidth: 84,
            minHeight: 30,
            padding: `0 ${hudSpace("sm")}`,
            borderRadius: 7,
            border: `1px solid ${armed ? "var(--jg-accent, #6ee7a8)" : "var(--jg-edge-bright, rgba(255,255,255,0.14))"}`,
            background: armed ? "var(--jg-accent-glow, rgba(110,231,168,0.25))" : "var(--jg-surface-deep, rgba(15,18,24,0.9))",
            color: armed ? "var(--jg-accent, #6ee7a8)" : "var(--jg-text, #ececef)",
            fontFamily: "var(--jg-font-numeric, monospace)",
            fontSize: hudType("sm"),
            cursor: "pointer",
          }}
        >
          {armed ? "Press…" : row.bindingLabel}
        </button>
        <button
          type="button"
          data-settings-reset=""
          onClick={() => row.reset()}
          aria-label={`Reset ${row.label}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            border: "none",
            background: "transparent",
            color: "var(--jg-text-dim, #94a3a0)",
            opacity: row.isDefault ? 0 : 1,
            pointerEvents: row.isDefault ? "none" : "auto",
            cursor: "pointer",
          }}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

/** How a {@link SettingsSection} handles a rebind capture. */
export interface SettingsSectionProps {
  /** The category to render: its rows and its rebindable actions. */
  category: SettingsCategoryView;
  /** Render the category label above the rows. Default true. */
  heading?: boolean;
  /** Allow click-to-rebind on the controls rows. Default true. */
  capture?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Called with the armed action id (or `null`) so a game can suspend its own keys. */
  onCaptureChange?: (action: string | null) => void;
}

/**
 * One settings category as a block: its rows, then its rebindable actions with click-to-capture. The
 * game picks where it sits and how wide it is; the block reads HudTheme tokens and the live rows the
 * settings controller hands it, and writes every change straight back to that controller's store.
 *
 * @capability settings-section settings category block — rows plus click-to-capture keybind rows, HudTheme-styled, store-backed
 */
export function SettingsSection({
  category,
  heading = true,
  capture = true,
  className,
  style,
  onCaptureChange,
}: SettingsSectionProps): ReactNode {
  const [armed, setArmed] = useState<string | null>(null);
  const callbacks = useRef({ onCaptureChange });
  callbacks.current = { onCaptureChange };

  useEffect(() => {
    callbacks.current.onCaptureChange?.(armed);
  }, [armed]);

  useEffect(() => {
    if (armed === null) return;
    const row = category.keybinds.find((candidate) => candidate.action === armed);
    if (row === undefined) {
      setArmed(null);
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setArmed(null);
        return;
      }
      row.rebind(event.code);
      setArmed(null);
    };
    const onPointer = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      row.rebind(`mouse${event.button}`);
      setArmed(null);
    };
    const onContext = (event: Event): void => event.preventDefault();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("contextmenu", onContext, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("contextmenu", onContext, true);
    };
  }, [armed, category.keybinds]);

  return (
    <section data-settings-section={category.id} className={className} style={{ display: "flex", flexDirection: "column", gap: hudSpace("xs"), ...style }}>
      {heading ? (
        <h3
          style={{
            margin: 0,
            marginBottom: hudSpace("xs"),
            fontFamily: "var(--jg-font-display, inherit)",
            fontSize: hudType("xs"),
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--jg-accent, #6ee7a8)",
          }}
        >
          {category.label}
        </h3>
      ) : null}
      {category.rows.map((row) => (
        <SettingsRowControl key={row.id} row={row} />
      ))}
      {category.keybinds.map((row) => (
        <SettingsKeybindControl
          key={row.action}
          row={row}
          armed={armed === row.action}
          onArm={capture ? () => setArmed(row.action) : undefined}
        />
      ))}
    </section>
  );
}

/** The live category tabs for a settings screen: a scrollable rail with pressed state. */
export interface SettingsTabsProps {
  /** The live categories from the settings controller. */
  categories: readonly SettingsCategoryView[];
  /** Id of the category on screen. */
  activeId: string;
  onSelect: (id: string) => void;
  /** Extra leading tab (the controller's game actions). */
  leading?: { id: string; label: string };
  /** Per-tab props from a `useMenuNav` controller, so a tab rail is keyboard/gamepad navigable. */
  tabProps?: (id: string) => object;
  className?: string;
  style?: CSSProperties;
}

/**
 * The category tab rail for a settings screen: a scrollable row of buttons with pressed state. The
 * game owns the surrounding layout; this block keeps every category reachable on narrow screens.
 *
 * @capability settings-tabs scrollable settings category tabs with pressed state
 */
export function SettingsTabs({ categories, activeId, onSelect, leading, tabProps, className, style }: SettingsTabsProps): ReactNode {
  const tabs = leading === undefined ? categories : [{ id: leading.id, label: leading.label }, ...categories];
  return (
    <div className={className} style={style}>
      <ScrollRail label="settings categories">
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              data-settings-tab={tab.id}
              {...(tabProps === undefined ? {} : (tabProps(tab.id) as Record<string, unknown>))}
              aria-pressed={selected}
              onClick={() => onSelect(tab.id)}
              style={{
                flexShrink: 0,
                minHeight: 34,
                padding: `0 ${hudSpace("md")}`,
                marginRight: hudSpace("xs"),
                borderRadius: 8,
                border: "1px solid transparent",
                background: selected ? "var(--jg-accent, #6ee7a8)" : "transparent",
                color: selected ? "var(--jg-surface-deep, #0b0b0f)" : "var(--jg-text-dim, #94a3a0)",
                fontSize: hudType("sm"),
                fontWeight: 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </ScrollRail>
    </div>
  );
}
