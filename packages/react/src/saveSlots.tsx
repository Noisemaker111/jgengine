import { useReducer, useEffect, type CSSProperties, type ReactNode } from "react";

import type { SaveSlotMeta, SaveSlots } from "@jgengine/core/game/saveSlots";

import { GameIcon, type GameIconName } from "./gameIcons";
import { HudFrame } from "./hudFrame";

/**
 * Subscribe to a {@link SaveSlots} index and re-render on any change (write,
 * clear, rename, restore). Returns the live list of slots in menu order. Wire it
 * into a save-select screen and mutate the model in event handlers — the menu
 * re-renders itself.
 *
 * @capability use-save-slots React hook binding a save-slots metadata index — re-renders on change and returns the ordered slot list
 */
export function useSaveSlots(model: SaveSlots): SaveSlotMeta[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => model.subscribe(bump), [model]);
  return model.list();
}

/** Reskin tokens for {@link SaveSlotMenu}. All optional — each falls back to a HudTheme var then a neutral default. */
export interface SaveSlotMenuTheme {
  /** Accent for the Continue action, savedAt time, and focus glow. Default reads `--jg-accent`. */
  accent?: string;
  /** Card background. */
  cardBg?: string;
  /** Card border. */
  cardBorder?: string;
  /** Primary text color (slot name). */
  text?: string;
  /** Muted text color (meta chips, empty label). */
  muted?: string;
  /** Meta-chip background. */
  chipBg?: string;
  /** Font family. */
  fontFamily?: string;
  /** Card corner radius (CSS length). */
  radius?: string;
}

function resolveTheme(theme: SaveSlotMenuTheme | undefined): Required<SaveSlotMenuTheme> {
  return {
    accent: theme?.accent ?? "var(--jg-accent, #38bdf8)",
    cardBg: theme?.cardBg ?? "var(--jg-frame-bg, linear-gradient(180deg, rgba(20,24,32,0.86), rgba(10,12,16,0.9)))",
    cardBorder: theme?.cardBorder ?? "var(--jg-frame-border, 1px solid rgba(255,255,255,0.12))",
    text: theme?.text ?? "#f1f5f9",
    muted: theme?.muted ?? "rgba(203,213,225,0.72)",
    chipBg: theme?.chipBg ?? "rgba(148,163,184,0.16)",
    fontFamily: theme?.fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    radius: theme?.radius ?? "var(--jg-frame-radius, 12px)",
  };
}

/**
 * Turn a `savedAt` timestamp into a compact relative label ("just now", "4m ago",
 * "2d ago"). Presentation-only helper — the model stores raw ms.
 */
export function relativeSavedAt(savedAt: number, nowMs = Date.now()): string {
  const delta = Math.max(0, nowMs - savedAt);
  const s = Math.floor(delta / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Props for {@link SaveSlotMenu}. */
export interface SaveSlotMenuProps {
  /** The metadata index to render. */
  model: SaveSlots;
  /**
   * Load an existing save. Given the filled slot the player chose. Wire this to
   * your `createSaveStore.switchSlot(id)` + scene load.
   */
  onLoad?: (slot: SaveSlotMeta) => void;
  /** Start a new game in an empty slot. Given the empty slot chosen. */
  onNew?: (slot: SaveSlotMeta) => void;
  /**
   * Delete a save. Given the filled slot. A game typically clears both this index
   * (`model.clear(id)`) and the matching `createSaveStore` slot.
   */
  onDelete?: (slot: SaveSlotMeta) => void;
  /**
   * Continue the most recent save (the Continue button targets `model.mostRecent()`).
   * Omit to hide the Continue button.
   */
  onContinue?: (slot: SaveSlotMeta) => void;
  /** Menu heading. Default `"Select Save"`. */
  title?: ReactNode;
  /** Reskin tokens. */
  theme?: SaveSlotMenuTheme;
  /** Wall clock (ms) for relative times — inject in tests/screenshots. Default `Date.now`. */
  now?: () => number;
  /** Optional per-`meta`-key icon, so a game can prefix chips (e.g. `{ level: "star", playtime: "hourglass" }`). */
  metaIcons?: Record<string, GameIconName>;
  className?: string;
  style?: CSSProperties;
}

const rowButton = (accent: string, primary: boolean): CSSProperties => ({
  pointerEvents: "auto",
  cursor: "pointer",
  borderRadius: 8,
  border: primary ? "none" : "1px solid rgba(148,163,184,0.28)",
  background: primary ? accent : "rgba(15,20,28,0.6)",
  color: primary ? "#0b1220" : "#e2e8f0",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  padding: "7px 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

/** One filled slot's meta rendered as chips. */
function MetaChips({
  slot,
  t,
  metaIcons,
}: {
  slot: SaveSlotMeta;
  t: Required<SaveSlotMenuTheme>;
  metaIcons: Record<string, GameIconName> | undefined;
}): ReactNode {
  const entries = Object.entries(slot.meta);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {entries.map(([key, value]) => {
        const icon = metaIcons?.[key];
        return (
          <span
            key={key}
            data-save-slot-chip={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: t.chipBg,
              color: t.muted,
              borderRadius: 999,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {icon !== undefined ? <GameIcon name={icon} size={12} color={t.accent} /> : null}
            <span style={{ opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 9 }}>{key}</span>
            <span style={{ color: t.text }}>{String(value)}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * A drop-in save-select / profile menu that renders a {@link SaveSlots} index as
 * a column of cards. A filled slot shows its name, the free-string `meta` the
 * game supplied as chips, and a relative "saved" time, with Load and Delete
 * actions; an empty slot shows a "New Game" affordance. A top-level Continue
 * button targets the newest save (`model.mostRecent()`). This is a starting-point
 * game-front-end building block — the game owns final art, wording, and layout;
 * reskin it with {@link SaveSlotMenuTheme} or HudTheme CSS vars. Presentation
 * only: all state lives in the core model, and `meta` keys are never interpreted.
 *
 * @capability save-slot-menu drop-in save-select / profile menu that renders a core save-slots index as New / Continue / Load / Delete cards with free-string meta chips and relative save times, theme-skinnable
 */
export function SaveSlotMenu({
  model,
  onLoad,
  onNew,
  onDelete,
  onContinue,
  title = "Select Save",
  theme,
  now = Date.now,
  metaIcons,
  className,
  style,
}: SaveSlotMenuProps): ReactNode {
  const slots = useSaveSlots(model);
  const t = resolveTheme(theme);
  const nowMs = now();
  const recent = model.mostRecent();

  return (
    <div
      className={className}
      data-save-slot-menu=""
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "min(92vw, 460px)",
        fontFamily: t.fontFamily,
        color: t.text,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.4 }}>{title}</div>
        {onContinue !== undefined && recent !== null ? (
          <button
            type="button"
            data-save-slot-continue=""
            style={rowButton(t.accent, true)}
            onClick={() => onContinue(recent)}
          >
            <GameIcon name="skip" size={14} color="#0b1220" />
            Continue
          </button>
        ) : null}
      </div>

      {slots.map((slot) => {
        const isRecent = recent !== null && slot.id === recent.id;
        return (
          <HudFrame
            key={slot.id}
            interactive
            variation="glass"
            padding={14}
            style={{
              background: t.cardBg,
              border: isRecent ? `1px solid ${t.accent}` : t.cardBorder,
              borderRadius: t.radius,
              boxShadow: isRecent ? `0 0 0 1px ${t.accent}, 0 8px 26px rgba(0,0,0,0.4)` : "0 6px 20px rgba(0,0,0,0.35)",
            }}
          >
            {slot.empty ? (
              <button
                type="button"
                data-save-slot-new=""
                onClick={() => onNew?.(slot)}
                style={{
                  pointerEvents: "auto",
                  cursor: "pointer",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "transparent",
                  border: "none",
                  color: t.muted,
                  padding: "6px 2px",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: `1px dashed ${t.muted}`,
                  }}
                >
                  <GameIcon name="star" size={18} color={t.muted} />
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: t.text }}>New Game</span>
                  <span style={{ fontSize: 11 }}>Empty slot · {slot.id}</span>
                </span>
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span data-save-slot-name="" style={{ fontSize: 16, fontWeight: 800 }}>
                    {slot.name ?? slot.id}
                  </span>
                  {slot.savedAt !== undefined ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.accent, whiteSpace: "nowrap" }}>
                      {relativeSavedAt(slot.savedAt, nowMs)}
                    </span>
                  ) : null}
                </div>
                <MetaChips slot={slot} t={t} metaIcons={metaIcons} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    data-save-slot-load=""
                    style={{ ...rowButton(t.accent, true), flex: 1, justifyContent: "center" }}
                    onClick={() => onLoad?.(slot)}
                  >
                    <GameIcon name="chest" size={14} color="#0b1220" />
                    Load
                  </button>
                  <button
                    type="button"
                    data-save-slot-delete=""
                    style={rowButton(t.accent, false)}
                    onClick={() => onDelete?.(slot)}
                    aria-label={`Delete ${slot.name ?? slot.id}`}
                  >
                    <GameIcon name="cross" size={14} />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </HudFrame>
        );
      })}
    </div>
  );
}
