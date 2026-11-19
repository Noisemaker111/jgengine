/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useReducer, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import type { RebindRow, RebindSession } from "@jgengine/core/input/rebindSession";

import { Keycap } from "@jgengine/core/input/keyHint.view";
import { hudType } from "@jgengine/core/hud/hudTokens";

/** @capability use-rebind-session UI hook that re-renders a component whenever a rebind session changes */
export function useRebindSession(session: RebindSession): RebindSession {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => session.subscribe(bump), [session]);
  return session;
}

export interface KeybindingMenuTheme {
  bg?: string;
  border?: string;
  radius?: string;
  text?: string;
  muted?: string;
  accent?: string;
  conflict?: string;
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

export interface KeybindingMenuProps {
  session: RebindSession;
  theme?: KeybindingMenuTheme;
  title?: ReactNode;
  resetAllLabel?: string;
  /** Prompt shown in a row that is armed for capture. Default `"Press a key…"`. */
  capturePrompt?: string;
  onChange?: (session: RebindSession) => void;
  className?: string;
  style?: CSSProperties;
}

/** @capability keybinding-menu drop-in controls-settings surface over a rebind session — click-to-capture rows with key glyphs, conflict badges, per-row and reset-all, HudTheme-skinnable */
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
      data-locked={row.locked ? "" : undefined}
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
              fontSize: hudType("xs"),
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

      {row.locked ? (
        <div
          data-keybinding-locked=""
          title="This control can't be changed"
          style={{ minWidth: 96, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, color: theme.muted }}
        >
          <span aria-label="Locked" style={{ fontSize: 12 }}>
            🔒
          </span>
          <Keycap style={{ ...keycapStyle(theme, conflicted), opacity: 0.7 }}>{row.bindingLabel || "—"}</Keycap>
        </div>
      ) : (
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
            <Keycap style={keycapStyle(theme, conflicted)}>{row.bindingLabel || "—"}</Keycap>
          )}
        </button>
      )}

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
          fontSize: hudType("xs"),
        }}
      >
        Reset
      </button>
    </div>
  );
}

function keycapStyle(theme: Required<KeybindingMenuTheme>, conflicted: boolean): CSSProperties {
  return {
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
  };
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
