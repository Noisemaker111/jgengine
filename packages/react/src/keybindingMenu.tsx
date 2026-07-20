import { useEffect, useReducer, type CSSProperties, type ReactNode } from "react";

import type { RebindRow, RebindSession } from "@jgengine/core/input/rebindSession";

import { Keycap } from "./keyHint";

/**
 * Subscribe to a rebind session and re-render on every change (capture, reset,
 * arm/disarm, restore). Returns the session unchanged for convenient inline use.
 *
 * @capability use-rebind-session React hook that re-renders a component whenever a rebind session changes
 */
export function useRebindSession(session: RebindSession): RebindSession {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(bump), [session]);
  return session;
}

/** Reskin tokens for {@link KeybindingMenu}. All fall back to HudTheme `--jg-*` vars. */
export interface KeybindingMenuTheme {
  /** Panel background. Default reads `--jg-frame-bg`. */
  bg?: string;
  /** Panel border. Default reads `--jg-frame-border`. */
  border?: string;
  /** Corner radius. Default reads `--jg-frame-radius`. */
  radius?: string;
  /** Row label text color. */
  text?: string;
  /** Muted text (hints, secondary). */
  muted?: string;
  /** Accent for the armed row + focus glow. Default reads `--jg-accent`. */
  accent?: string;
  /** Conflict highlight color. */
  conflict?: string;
  /** Font family. */
  fontFamily?: string;
}

function resolveTheme(theme: KeybindingMenuTheme | undefined): Required<KeybindingMenuTheme> {
  return {
    bg: theme?.bg ?? "var(--jg-frame-bg, linear-gradient(180deg, rgba(20,24,32,0.92), rgba(10,12,16,0.95)))",
    border: theme?.border ?? "var(--jg-frame-border, 1px solid rgba(255,255,255,0.12))",
    radius: theme?.radius ?? "var(--jg-frame-radius, 12px)",
    text: theme?.text ?? "#e8edf5",
    muted: theme?.muted ?? "rgba(148,163,184,0.85)",
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    conflict: theme?.conflict ?? "#f87171",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
  };
}

/** Props for {@link KeybindingMenu}. */
export interface KeybindingMenuProps {
  /** The rebind session to edit. */
  session: RebindSession;
  /** Reskin tokens (fall back to HudTheme). */
  theme?: KeybindingMenuTheme;
  /** Heading shown above the list. Default `"Controls"`. */
  title?: ReactNode;
  /** Label for the reset-all button. Default `"Reset All"`. */
  resetAllLabel?: string;
  /** Prompt shown in a row that is armed for capture. Default `"Press a key…"`. */
  capturePrompt?: string;
  /** Called after a successful rebind or reset — e.g. persist `session.overrides()`. */
  onChange?: (session: RebindSession) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * A drop-in controls-settings surface for a {@link RebindSession}: one row per
 * action showing its label and current key glyph. Clicking a row arms capture
 * ("Press a key…") and a window `keydown` listener feeds the pressed
 * `event.code` to `session.capture`; rows that collide with another action show
 * a conflict badge; each row has a Reset button and the panel has a Reset-all
 * button. Presentation only — all conflict/capture/reset logic lives in the core
 * session, and action ids/labels are the game's free strings. Reskin via
 * {@link KeybindingMenuTheme} or ambient HudTheme tokens. A game owns its overall
 * settings layout; this is the reusable controls block it drops in.
 *
 * @capability keybinding-menu drop-in controls-settings surface over a rebind session — click-to-capture rows with key glyphs, conflict badges, per-row and reset-all, HudTheme-skinnable
 */
export function KeybindingMenu({
  session,
  theme,
  title = "Controls",
  resetAllLabel = "Reset All",
  capturePrompt = "Press a key…",
  onChange,
  className,
  style,
}: KeybindingMenuProps): ReactNode {
  useRebindSession(session);
  const t = resolveTheme(theme);
  const rows = session.rows();
  const capturing = session.capturingActionId();

  // While armed, the next keydown anywhere reassigns the row (Escape cancels).
  useEffect(() => {
    if (capturing === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        session.cancelCapture();
        return;
      }
      session.capture(event.code);
      onChange?.(session);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [capturing, session, onChange]);

  const anyConflict = session.hasConflicts();

  return (
    <div
      data-keybinding-menu=""
      className={className}
      style={{
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(420px, 92vw)",
        padding: "16px 18px",
        background: t.bg,
        border: t.border,
        borderRadius: t.radius,
        color: t.text,
        fontFamily: t.fontFamily,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</div>
        <button
          type="button"
          data-keybinding-reset-all=""
          onClick={() => {
            session.resetAll();
            onChange?.(session);
          }}
          style={buttonStyle(t.muted, t.border)}
        >
          {resetAllLabel}
        </button>
      </div>

      {anyConflict ? (
        <div style={{ fontSize: 12, color: t.conflict, fontWeight: 600 }}>
          ⚠ Some keys are bound to more than one action.
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row) => (
          <KeybindingRow
            key={row.actionId}
            row={row}
            armed={capturing === row.actionId}
            capturePrompt={capturePrompt}
            theme={t}
            onArm={() => session.beginCapture(row.actionId)}
            onReset={() => {
              session.reset(row.actionId);
              onChange?.(session);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function KeybindingRow({
  row,
  armed,
  capturePrompt,
  theme,
  onArm,
  onReset,
}: {
  row: RebindRow;
  armed: boolean;
  capturePrompt: string;
  theme: Required<KeybindingMenuTheme>;
  onArm: () => void;
  onReset: () => void;
}): ReactNode {
  const conflicted = row.conflictWith.length > 0;
  return (
    <div
      data-keybinding-row={row.actionId}
      data-armed={armed ? "" : undefined}
      data-conflict={conflicted ? "" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: armed ? "rgba(56,189,248,0.14)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${armed ? theme.accent : conflicted ? theme.conflict : "transparent"}`,
        boxShadow: armed ? `0 0 0 1px ${theme.accent}, 0 0 14px rgba(56,189,248,0.35)` : "none",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {row.label}
        {conflicted ? (
          <span
            data-keybinding-conflict-badge=""
            style={{
              marginLeft: 8,
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#1a0808",
              background: theme.conflict,
            }}
          >
            Conflict
          </span>
        ) : null}
      </div>

      <button
        type="button"
        data-keybinding-capture=""
        onClick={onArm}
        style={{
          minWidth: 96,
          display: "flex",
          justifyContent: "center",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          padding: 0,
        }}
      >
        {armed ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.accent }}>{capturePrompt}</span>
        ) : (
          <Keycap
            style={{
              minWidth: 34,
              padding: "3px 9px",
              borderRadius: 6,
              textAlign: "center",
              fontSize: 13,
              fontWeight: 700,
              color: conflicted ? theme.conflict : theme.text,
              background: "rgba(0,0,0,0.4)",
              border: `1px solid ${conflicted ? theme.conflict : "rgba(255,255,255,0.18)"}`,
              boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.4)",
            }}
          >
            {row.bindingLabel || "—"}
          </Keycap>
        )}
      </button>

      <button
        type="button"
        data-keybinding-reset=""
        onClick={onReset}
        disabled={row.isDefault}
        title="Reset to default"
        style={{
          ...buttonStyle(theme.muted, theme.border),
          opacity: row.isDefault ? 0.35 : 1,
          cursor: row.isDefault ? "default" : "pointer",
          padding: "4px 8px",
          fontSize: 11,
        }}
      >
        Reset
      </button>
    </div>
  );
}

function buttonStyle(color: string, border: string): CSSProperties {
  return {
    pointerEvents: "auto",
    background: "rgba(255,255,255,0.05)",
    border,
    borderRadius: 8,
    color,
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 10px",
    cursor: "pointer",
  };
}
