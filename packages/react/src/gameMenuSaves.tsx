import { useState, type CSSProperties, type ReactNode } from "react";

import type { CreditsSection } from "@jgengine/core/game/credits";
import { formatSavePlaytime } from "@jgengine/core/game/saveSlotIndex";
import type { SaveSlotMeta, SaveSlots } from "@jgengine/core/game/saveSlots";

import { hudDuration, hudEase, hudFont, hudSpace, hudType } from "./hudTokens";
import { useMenuNav } from "./menuNav";
import { relativeSavedAt, useSaveSlots } from "./saveSlots";

/**
 * The save slot `meta` key a card reads as its thumbnail: a data URL or image URL captured when the
 * save was written. Every other meta key is shown as a progress chip and never interpreted.
 */
export const SAVE_SLOT_THUMBNAIL_KEY = "thumbnail";

/** The character name a save card shows first, when the game supplies one as its own meta key. */
export const SAVE_SLOT_CHARACTER_KEY = "character";

const cardSurface: CSSProperties = {
  position: "relative",
  width: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
  padding: 10,
  borderRadius: "var(--jg-menu-card-radius, 12px)",
  background: "linear-gradient(180deg, rgba(16,22,30,0.78), rgba(8,11,16,0.86))",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.09), 0 14px 34px -18px rgba(0,0,0,0.9)",
  backdropFilter: "blur(6px)",
  color: "var(--jg-text, #f2f6fb)",
  fontFamily: hudFont.body,
  textAlign: "left",
};

function thumbnailOf(slot: SaveSlotMeta): string | null {
  const value = slot.meta[SAVE_SLOT_THUMBNAIL_KEY];
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

function progressEntries(slot: SaveSlotMeta): [string, string][] {
  return Object.entries(slot.meta)
    .filter(([key, value]) => key !== SAVE_SLOT_THUMBNAIL_KEY && key !== "playtime" && String(value).length > 0)
    .map(([key, value]) => [key, String(value)]);
}

function playtimeOf(slot: SaveSlotMeta): string | null {
  const value = slot.meta.playtime;
  if (value === undefined) return null;
  if (typeof value === "number") return formatSavePlaytime(value);
  return String(value);
}

/** Props for {@link SaveSlotCard}. */
export interface SaveSlotCardProps {
  /** The slot to render. An empty slot renders as an empty slot, not a hidden row. */
  slot: SaveSlotMeta;
  /** Clock (ms) for the relative "saved" line. */
  now?: () => number;
  /** Highlight this slot as the one Continue would resume. */
  recent?: boolean;
  /** Load this filled slot, or start a new game in this empty slot. */
  onSelect?: (slot: SaveSlotMeta) => void;
  /** Delete this slot. Only called after the player confirms. */
  onDelete?: (slot: SaveSlotMeta) => void;
  /** Label of the primary action on a filled card. Default `"Load"`. */
  loadLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * One save slot as a card: a captured thumbnail, the character name, playtime, the game's progress
 * summary and when it was saved — or, for an empty slot, an empty slot with a New Game affordance.
 * Deleting takes two presses: the first swaps the button for a confirm pair, so a mis-click cannot
 * erase a run.
 *
 * @capability save-slot-card save slot as a card — thumbnail, character, playtime, progress, timestamp, confirmed delete
 */
export function SaveSlotCard({
  slot,
  now = Date.now,
  recent = false,
  onSelect,
  onDelete,
  loadLabel,
  className,
  style,
}: SaveSlotCardProps): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const thumb = thumbnailOf(slot);
  const playtime = playtimeOf(slot);
  const progress = progressEntries(slot);
  const character = slot.meta[SAVE_SLOT_CHARACTER_KEY];

  if (slot.empty) {
    return (
      <button
        type="button"
        data-save-slot-card=""
        data-save-slot-id={slot.id}
        data-empty=""
        className={className}
        onClick={() => onSelect?.(slot)}
        style={{
          ...cardSurface,
          cursor: onSelect === undefined ? "default" : "pointer",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          border: "none",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.07), inset 0 0 40px -18px rgba(125,211,252,0.4), 0 10px 26px -20px rgba(0,0,0,0.9)",
          background: "linear-gradient(180deg, rgba(12,17,24,0.6), rgba(6,9,13,0.72))",
          ...style,
        }}
      >
        <div
          data-save-slot-thumb=""
          data-empty=""
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 8,
            border: "1px dashed rgba(203,213,225,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(203,213,225,0.5)",
            fontSize: hudType("xs"),
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Empty slot
        </div>
        <span style={{ fontSize: hudType("md"), fontWeight: 700 }}>New game</span>
        <span style={{ fontSize: hudType("xs"), color: "rgba(203,213,225,0.6)" }}>Slot {slot.id}</span>
      </button>
    );
  }

  return (
    <div
      data-save-slot-card=""
      data-save-slot-id={slot.id}
      data-recent={recent ? "" : undefined}
      className={className}
      style={{
        ...cardSurface,
        boxShadow: recent
          ? "inset 0 0 0 1px var(--jg-accent, #7dd3fc), 0 0 0 1px rgba(125,211,252,0.35), 0 18px 40px -18px rgba(0,0,0,0.95)"
          : cardSurface.boxShadow,
        ...style,
      }}
    >
      <div
        data-save-slot-thumb=""
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 8,
          overflow: "hidden",
          background: "radial-gradient(120% 120% at 30% 20%, rgba(125,211,252,0.22), rgba(8,12,18,0.9))",
        }}
      >
        {thumb === null ? (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: hudType("xs"),
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(203,213,225,0.45)",
            }}
          >
            No capture
          </span>
        ) : (
          <img
            data-save-slot-thumb-img=""
            src={thumb}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "42%",
            background: "linear-gradient(180deg, transparent, rgba(4,7,11,0.92))",
          }}
        />
        <span
          data-save-slot-name=""
          style={{
            position: "absolute",
            left: 8,
            bottom: 5,
            fontFamily: hudFont.display,
            fontSize: hudType("lg"),
            fontWeight: 800,
            letterSpacing: "0.01em",
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          {slot.name ?? slot.id}
        </span>
        {recent ? (
          <span
            data-save-slot-recent=""
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              padding: "2px 7px",
              borderRadius: 999,
              background: "var(--jg-accent, #7dd3fc)",
              color: "#04121b",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
            }}
          >
            Latest
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: hudType("xs"), color: "rgba(203,213,225,0.66)", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {typeof character === "string" ? <span data-save-slot-character="">{character}</span> : null}
          {playtime === null ? null : <span data-save-slot-playtime="">{playtime} played</span>}
        </span>
        {slot.savedAt === undefined ? null : (
          <span
            data-save-slot-saved-at=""
            title={new Date(slot.savedAt).toLocaleString()}
            style={{ fontSize: hudType("xs"), color: "var(--jg-accent, #7dd3fc)", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {relativeSavedAt(slot.savedAt, now())}
          </span>
        )}
      </div>

      {progress.length === 0 ? null : (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {progress.map(([key, value]) => (
            <span
              key={key}
              data-save-slot-chip={key}
              style={{
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(148,163,184,0.14)",
                color: "rgba(226,235,245,0.82)",
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>{key}</span> {value}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <button
          type="button"
          data-save-slot-load=""
          onClick={() => onSelect?.(slot)}
          style={{
            flex: 1,
            padding: "7px 10px",
            borderRadius: 8,
            border: "none",
            background: "var(--jg-accent, #7dd3fc)",
            color: "#04121b",
            fontSize: hudType("sm"),
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {loadLabel ?? "Load"}
        </button>
        {onDelete === undefined ? null : confirming ? (
          <>
            <button
              type="button"
              data-save-slot-confirm-delete=""
              onClick={() => {
                setConfirming(false);
                onDelete(slot);
              }}
              style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid var(--jg-danger, #e5484d)",
                background: "rgba(229,72,77,0.2)",
                color: "#ffd7d8",
                fontSize: hudType("sm"),
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              type="button"
              data-save-slot-cancel-delete=""
              onClick={() => setConfirming(false)}
              style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "transparent",
                color: "rgba(226,235,245,0.8)",
                fontSize: hudType("sm"),
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            data-save-slot-delete=""
            aria-label={`Delete ${slot.name ?? slot.id}`}
            onClick={(event) => {
              event.stopPropagation();
              setConfirming(true);
            }}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.28)",
              background: "transparent",
              color: "rgba(226,235,245,0.72)",
              fontSize: hudType("sm"),
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** Props for {@link SaveSlotsPane}. */
export interface SaveSlotsPaneProps {
  /** The save-slot index to render. */
  model: SaveSlots;
  /** Resume the most recent save. Continue targets `model.mostRecent()`. */
  onContinue?: (slot: SaveSlotMeta) => void;
  /** Load a chosen filled slot. */
  onLoad?: (slot: SaveSlotMeta) => void;
  /** Start a new game in a chosen empty slot. */
  onNew?: (slot: SaveSlotMeta) => void;
  /** Delete a confirmed slot. */
  onDelete?: (slot: SaveSlotMeta) => void;
  /** Heading over the grid. Default `"Save slots"`. */
  heading?: ReactNode;
  /** Clock (ms) for relative times. */
  now?: () => number;
  /** Cards per row, or `"auto"` to fit as many as the pane allows (min 230px each). Default 2. */
  columns?: number | "auto";
  className?: string;
  style?: CSSProperties;
}

/**
 * The slot grid for a {@link GameMenu} detail pane: Continue over the most recent save, then one card
 * per slot. Arrow keys move between cards, Enter loads, and the grid scrolls inside its own pane
 * rather than the page.
 *
 * @capability save-slots-pane slot grid pane for the game menu — Continue newest, per-slot cards, keyboard navigation
 */
export function SaveSlotsPane({
  model,
  onContinue,
  onLoad,
  onNew,
  onDelete,
  heading = "Save slots",
  now = Date.now,
  columns = 2,
  className,
  style,
}: SaveSlotsPaneProps): ReactNode {
  const slots = useSaveSlots(model);
  const recent = model.mostRecent();
  const tracks = columns === "auto" ? 3 : columns;
  const nav = useMenuNav({
    ids: slots.map((slot) => slot.id),
    columns: tracks,
    wrap: false,
    onConfirm: (id) => {
      const slot = slots.find((candidate) => candidate.id === id);
      if (slot === undefined) return;
      if (slot.empty) onNew?.(slot);
      else onLoad?.(slot);
    },
  });

  return (
    <div
      data-save-slots-pane=""
      className={className}
      style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, gap: hudSpace("md"), ...style }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontFamily: hudFont.display, fontSize: hudType("xxl"), fontWeight: 800, letterSpacing: "0.01em" }}>
          {heading}
        </div>
        {onContinue === undefined || recent === null ? null : (
          <button
            type="button"
            data-save-slots-continue=""
            onClick={() => onContinue(recent)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              background: "var(--jg-accent, #7dd3fc)",
              color: "#04121b",
              fontSize: hudType("sm"),
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "0 10px 24px -12px rgba(125,211,252,0.8)",
            }}
          >
            Continue {recent.name ?? recent.id}
          </button>
        )}
      </div>
      <div
        {...nav.containerProps}
        data-save-slots-grid=""
        style={{
          display: "grid",
          gridTemplateColumns:
            columns === "auto" ? "repeat(auto-fill, minmax(230px, 1fr))" : `repeat(${columns}, minmax(0, 1fr))`,
          gap: hudSpace("md"),
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          scrollbarWidth: "none",
          paddingRight: 2,
          paddingBottom: 4,
        }}
      >
        {slots.map((slot) => {
          const active = nav.activeId === slot.id;
          return (
            <div key={slot.id} style={{ minWidth: 0, outline: active ? "none" : undefined }}>
              <SaveSlotCard
                slot={slot}
                now={now}
                recent={recent !== null && recent.id === slot.id}
                {...(onLoad === undefined && onNew === undefined
                  ? {}
                  : {
                      onSelect: (chosen: SaveSlotMeta) => {
                        if (chosen.empty) onNew?.(chosen);
                        else onLoad?.(chosen);
                      },
                    })}
                {...(onDelete === undefined ? {} : { onDelete })}
                style={{
                  height: "100%",
                  ...(active
                    ? {
                        boxShadow:
                          "inset 0 0 0 1px var(--jg-accent, #7dd3fc), 0 0 0 1px rgba(125,211,252,0.5), 0 18px 40px -18px rgba(0,0,0,0.95)",
                        transform: "translateY(-2px)",
                        transition: `transform ${hudDuration("fast")} ${hudEase("spring")}`,
                      }
                    : {}),
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Props for {@link ContinuePane}. */
export interface ContinuePaneProps {
  /** The save Continue would resume. `null` when nothing is saved yet. */
  slot: SaveSlotMeta | null;
  /** Resume it. */
  onContinue?: (slot: SaveSlotMeta) => void;
  /** Shown instead of the card when `slot` is null. */
  emptyMessage?: ReactNode;
  /** Clock (ms) for relative times. */
  now?: () => number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Continue detail pane: the save being continued, read big — captured thumbnail, character, time
 * played, the game's progress summary, when it was saved, and the resume action.
 *
 * @capability continue-pane continue detail pane — the save being resumed with thumbnail, character, playtime and progress
 */
export function ContinuePane({
  slot,
  onContinue,
  emptyMessage = "No run saved yet. Start a new game to begin one.",
  now = Date.now,
  className,
  style,
}: ContinuePaneProps): ReactNode {
  if (slot === null) {
    return (
      <div
        data-continue-pane=""
        data-empty=""
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 10,
          minHeight: 0,
          color: "rgba(226,235,245,0.62)",
          fontFamily: hudFont.body,
          ...style,
        }}
      >
        <div style={{ fontFamily: hudFont.display, fontSize: hudType("xxl"), fontWeight: 800, color: "rgba(226,235,245,0.8)" }}>
          Nothing to continue
        </div>
        <p style={{ margin: 0, fontSize: hudType("md"), maxWidth: "42ch" }}>{emptyMessage}</p>
      </div>
    );
  }

  const thumb = thumbnailOf(slot);
  const playtime = playtimeOf(slot);
  const progress = progressEntries(slot);

  return (
    <div
      data-continue-pane=""
      data-save-slot-id={slot.id}
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: hudSpace("md"), minHeight: 0, ...style }}
    >
      <div
        style={{
          position: "relative",
          width: "min(100%, 560px)",
          aspectRatio: "16 / 9",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 30px 70px -30px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.12)",
          background: "radial-gradient(120% 120% at 28% 18%, rgba(125,211,252,0.25), rgba(6,10,16,0.92))",
        }}
      >
        {thumb === null ? (
          <span
            style={{
              position: "absolute",
              left: 14,
              bottom: 12,
              fontSize: hudType("xs"),
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(203,213,225,0.36)",
            }}
          >
            No capture yet
          </span>
        ) : (
          <img
            data-continue-thumb=""
            src={thumb}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
        <span
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, transparent 40%, rgba(4,7,11,0.9))",
          }}
        />
        <div style={{ position: "absolute", left: 14, bottom: 10, right: 14 }}>
          <div style={{ fontSize: hudType("xs"), letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--jg-accent, #7dd3fc)", fontWeight: 700 }}>
            Continue
          </div>
          <div
            data-continue-name=""
            style={{ fontFamily: hudFont.display, fontSize: hudType("display"), fontWeight: 800, lineHeight: 1.05 }}
          >
            {slot.name ?? slot.id}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {playtime === null ? null : (
          <span
            data-continue-playtime=""
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              background: "rgba(148,163,184,0.16)",
              fontSize: hudType("sm"),
              fontWeight: 700,
            }}
          >
            {playtime} played
          </span>
        )}
        {progress.map(([key, value]) => (
          <span
            key={key}
            data-continue-chip={key}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              background: "rgba(148,163,184,0.16)",
              fontSize: hudType("sm"),
              fontWeight: 600,
            }}
          >
            <span style={{ opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 }}>{key}</span> {value}
          </span>
        ))}
        {slot.savedAt === undefined ? null : (
          <span data-continue-saved-at="" style={{ fontSize: hudType("sm"), color: "rgba(203,213,225,0.62)" }}>
            Saved {relativeSavedAt(slot.savedAt, now())} · {new Date(slot.savedAt).toLocaleString()}
          </span>
        )}
      </div>

      {onContinue === undefined ? null : (
        <button
          type="button"
          data-continue-action=""
          onClick={() => onContinue(slot)}
          style={{
            alignSelf: "flex-start",
            padding: "11px 22px",
            borderRadius: 10,
            border: "none",
            background: "var(--jg-accent, #7dd3fc)",
            color: "#04121b",
            fontFamily: hudFont.display,
            fontSize: hudType("lg"),
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: "pointer",
            boxShadow: "0 18px 34px -18px rgba(125,211,252,0.9)",
          }}
        >
          Resume
        </button>
      )}
    </div>
  );
}

/** One avatar/portrait choice in {@link NewCharacterPane}. */
export interface GameMenuAvatar {
  id: string;
  label: string;
  /** A glyph or small image. Falls back to the label's first letter. */
  glyph?: ReactNode;
}

/** One palette choice in {@link NewCharacterPane}. */
export interface GameMenuPalette {
  id: string;
  label: string;
  /** Two or more CSS colours; rendered as a swatch chip. */
  colors: readonly string[];
}

/** What {@link NewCharacterPane} reports when a run starts. */
export interface NewCharacterChoice {
  name: string;
  paletteId: string | null;
  avatarId: string | null;
}

/** Props for {@link NewCharacterPane}. */
export interface NewCharacterPaneProps {
  /** Current name value. */
  name: string;
  onNameChange: (name: string) => void;
  /** Palette choices the game offers. Omit to hide the row. */
  palettes?: readonly GameMenuPalette[];
  paletteId?: string | null;
  onPaletteChange?: (id: string) => void;
  /** Avatar choices the game offers. Omit to hide the row. */
  avatars?: readonly GameMenuAvatar[];
  avatarId?: string | null;
  onAvatarChange?: (id: string) => void;
  /** Start the run with the current choice. */
  onStart: (choice: NewCharacterChoice) => void;
  /** Heading. Default `"New run"`. */
  heading?: ReactNode;
  /** Name field label. Default `"Character name"`. */
  nameLabel?: string;
  /** Name placeholder. */
  namePlaceholder?: string;
  /** Longest accepted name. Default 24. */
  maxLength?: number;
  /** Start button label. Default `"Begin"`. */
  startLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The New Game detail pane: a character name field, an optional palette and avatar choice, and the
 * action that starts the run. The name field is a real form field, so menu key handling leaves typing
 * alone (Enter inside the field starts the run).
 *
 * @capability new-character-pane character creation pane — name field, palette and avatar choice, start action
 */
export function NewCharacterPane({
  name,
  onNameChange,
  palettes,
  paletteId,
  onPaletteChange,
  avatars,
  avatarId,
  onAvatarChange,
  onStart,
  heading = "New run",
  nameLabel = "Character name",
  namePlaceholder = "Name your character",
  maxLength = 24,
  startLabel = "Begin",
  className,
  style,
}: NewCharacterPaneProps): ReactNode {
  const trimmed = name.trim();
  const start = (): void => {
    if (trimmed.length === 0) return;
    onStart({ name: trimmed, paletteId: paletteId ?? null, avatarId: avatarId ?? null });
  };
  return (
    <div
      data-new-character-pane=""
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: hudSpace("md"), minHeight: 0, fontFamily: hudFont.body, ...style }}
    >
      <div style={{ fontFamily: hudFont.display, fontSize: hudType("xxl"), fontWeight: 800 }}>{heading}</div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: hudType("xs"), letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(203,213,225,0.7)" }}>
          {nameLabel}
        </span>
        <input
          data-new-character-name=""
          value={name}
          maxLength={maxLength}
          placeholder={namePlaceholder}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              start();
            }
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(8,12,18,0.72)",
            color: "var(--jg-text, #f2f6fb)",
            fontFamily: hudFont.display,
            fontSize: hudType("xl"),
            fontWeight: 700,
            outline: "none",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        />
      </label>

      {avatars === undefined || avatars.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: hudType("xs"), letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(203,213,225,0.7)" }}>
            Avatar
          </span>
          <div data-new-character-avatars="" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {avatars.map((avatar) => {
              const picked = avatar.id === avatarId;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  data-new-character-avatar={avatar.id}
                  aria-pressed={picked}
                  onClick={() => onAvatarChange?.(avatar.id)}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    border: picked ? "1px solid var(--jg-accent, #7dd3fc)" : "1px solid rgba(148,163,184,0.28)",
                    background: picked ? "rgba(125,211,252,0.2)" : "rgba(10,14,20,0.7)",
                    color: "var(--jg-text, #f2f6fb)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: hudFont.display,
                    fontSize: hudType("lg"),
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {avatar.glyph ?? avatar.label.slice(0, 1).toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {palettes === undefined || palettes.length === 0 ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: hudType("xs"), letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(203,213,225,0.7)" }}>
            Palette
          </span>
          <div data-new-character-palettes="" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {palettes.map((palette) => {
              const picked = palette.id === paletteId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  data-new-character-palette={palette.id}
                  aria-pressed={picked}
                  onClick={() => onPaletteChange?.(palette.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "4px 10px 4px 4px",
                    borderRadius: 999,
                    border: picked ? "1px solid var(--jg-accent, #7dd3fc)" : "1px solid rgba(148,163,184,0.26)",
                    background: picked ? "rgba(125,211,252,0.14)" : "rgba(10,14,20,0.62)",
                    color: "rgba(226,235,245,0.86)",
                    fontSize: hudType("sm"),
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex" }}>
                    {palette.colors.map((color, index) => (
                      <span
                        key={index}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          background: color,
                          marginLeft: index === 0 ? 0 : -4,
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                        }}
                      />
                    ))}
                  </span>
                  {palette.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        data-new-character-start=""
        disabled={trimmed.length === 0}
        onClick={start}
        style={{
          alignSelf: "flex-start",
          padding: "11px 22px",
          borderRadius: 10,
          border: "none",
          background: trimmed.length === 0 ? "rgba(148,163,184,0.24)" : "var(--jg-accent, #7dd3fc)",
          color: trimmed.length === 0 ? "rgba(226,235,245,0.5)" : "#04121b",
          fontFamily: hudFont.display,
          fontSize: hudType("lg"),
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor: trimmed.length === 0 ? "not-allowed" : "pointer",
          boxShadow: trimmed.length === 0 ? "none" : "0 18px 34px -18px rgba(125,211,252,0.9)",
        }}
      >
        {startLabel}
      </button>
    </div>
  );
}


/** Props for {@link CreditsPane}. */
export interface CreditsPaneProps {
  /** Sections, in order. */
  sections: readonly CreditsSection[];
  /** Heading over the scroller. Default `"Credits"`. */
  heading?: ReactNode;
  /** Closing line, usually the asset/attribution notice. */
  notice?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Credits detail pane: a scroller that belongs to the pane. Wheel, arrows, PageUp/PageDown, Home
 * and End scroll it, the native scrollbar is hidden, and the page behind never moves.
 *
 * @capability credits-pane credits detail pane — sections scrolled inside the pane
 */
export function CreditsPane({ sections, heading = "Credits", notice, className, style }: CreditsPaneProps): ReactNode {
  return (
    <div
      data-credits-pane=""
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: hudSpace("sm"), minHeight: 0, flex: 1, fontFamily: hudFont.body, ...style }}
    >
      <div style={{ fontFamily: hudFont.display, fontSize: hudType("xxl"), fontWeight: 800 }}>{heading}</div>
      <div
        data-credits-scroller=""
        tabIndex={0}
        onKeyDown={(event) => {
          const target = event.currentTarget;
          const step = target.clientHeight * 0.8;
          const moves: Record<string, number> = {
            ArrowDown: 48,
            ArrowUp: -48,
            PageDown: step,
            PageUp: -step,
          };
          if (event.key === "Home") {
            event.preventDefault();
            target.scrollTop = 0;
            return;
          }
          if (event.key === "End") {
            event.preventDefault();
            target.scrollTop = target.scrollHeight;
            return;
          }
          const delta = moves[event.key];
          if (delta === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          target.scrollTop += delta;
        }}
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          scrollbarWidth: "none",
          paddingRight: 6,
          outline: "none",
          maskImage: "linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 22px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 22px), transparent 100%)",
        }}
      >
        {sections.map((section) => (
          <section key={section.heading} data-credits-section="" style={{ marginBottom: hudSpace("lg") }}>
            <div
              style={{
                fontSize: hudType("xs"),
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--jg-accent, #7dd3fc)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {section.heading}
            </div>
            {section.entries.map((entry) => (
              <div
                key={`${section.heading}:${entry.label}`}
                style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "3px 0", fontSize: hudType("md") }}
              >
                <span style={{ fontWeight: 600 }}>{entry.label}</span>
                {entry.detail === undefined ? null : (
                  <span style={{ color: "rgba(203,213,225,0.62)", textAlign: "right" }}>{entry.detail}</span>
                )}
              </div>
            ))}
          </section>
        ))}
        {notice === undefined ? null : (
          <p style={{ margin: 0, fontSize: hudType("xs"), color: "rgba(203,213,225,0.5)", maxWidth: "60ch" }}>{notice}</p>
        )}
      </div>
    </div>
  );
}





