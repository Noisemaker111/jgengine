import type { GameSave, GameSaveDocument } from "./saveDocument";
import type { PeekResult } from "./saveStore";
import type { SaveSlotMeta, SaveSlots } from "./saveSlots";

/**
 * Bridging the versioned save document (`createGameSave`) to the save-select index (`createSaveSlots`):
 * the document already carries `savedAt`, `time` and `playtime`, so a menu built on the index can show
 * real saves instead of hand-maintained metadata.
 */

/** How one document becomes a menu slot. */
export interface SaveSlotMetaOptions {
  /** Player-facing name for the slot. Defaults to the slot id. */
  nameOf?: (slot: string, document: GameSaveDocument) => string;
  /**
   * Extra display chips, merged over the playtime chip. The game decides which document fields matter
   * (`chapter`, `location`, `level`, …); the index never interprets meta keys.
   */
  metaOf?: (slot: string, document: GameSaveDocument) => Record<string, string | number>;
}

/** "4h 12m" / "12m" / "< 1m" — the playtime chip every save menu wants. */
export function formatSavePlaytime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "< 1m";
}

/**
 * Project one save document onto the index's display metadata: name, last-saved time and a playtime
 * chip (plus any caller `metaOf` fields). Pure, so a menu can build its list from documents a host
 * fetched for it.
 *
 * @capability save-slot-meta project a save document onto save-select display metadata
 */
export function saveSlotMeta(
  slot: string,
  document: GameSaveDocument,
  options: SaveSlotMetaOptions = {},
): SaveSlotMeta {
  return {
    id: slot,
    name: options.nameOf?.(slot, document) ?? slot,
    empty: false,
    savedAt: document.savedAt,
    meta: {
      playtime: formatSavePlaytime(document.playtime),
      ...options.metaOf?.(slot, document),
    },
  };
}

/** The source a slot list is refreshed from — a `GameSave`, or a narrower reader. */
export interface SaveSlotSource {
  slots(): Promise<string[]>;
  peek(slot: string): Promise<PeekResult<GameSaveDocument>>;
}

/**
 * The result of a refresh: what the menu should show now, or `failed` when the slot list itself
 * could not be read (storage blocked, a backend refused) and the index was left as it was.
 */
export type SaveSlotsRefresh =
  | {
      readonly kind: "refreshed";
      /** Written slots in the order the save store indexes them. */
      saved: string[];
      /** Slot metadata for every written slot. */
      filled: SaveSlotMeta[];
      /** Written slots the index could not hold (id not in it and the index is full). */
      skipped: string[];
      /** Written slots whose document is damaged or could not be read — a menu shows them as such, not as empty. */
      unreadable: string[];
    }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * Read every written slot's document and write the display metadata into a `SaveSlots` index — the
 * glue between B5.3's save document and a save-select menu. Slots the index already knows that have
 * no document are cleared, so a deleted save stops showing a stale Continue. Never rejects: menus
 * refresh from effects and button handlers, so an unreadable list is a `failed` result, and the
 * index keeps what it showed rather than clearing saves it could not see.
 *
 * @capability save-slot-index refresh a save-select index from the game's save documents
 */
export async function refreshSaveSlots(
  source: SaveSlotSource,
  model: SaveSlots,
  options: SaveSlotMetaOptions = {},
): Promise<SaveSlotsRefresh> {
  let saved: string[];
  try {
    saved = await source.slots();
  } catch (error) {
    return { kind: "failed", error };
  }
  const filled: SaveSlotMeta[] = [];
  const skipped: string[] = [];
  const unreadable: string[] = [];
  for (const slot of saved) {
    const read = await source.peek(slot);
    if (read.kind === "empty") continue;
    if (read.kind !== "loaded") {
      unreadable.push(slot);
      continue;
    }
    const meta = saveSlotMeta(slot, read.value, options);
    try {
      model.write(slot, { name: meta.name, meta: meta.meta, savedAt: meta.savedAt });
    } catch {
      skipped.push(slot);
      continue;
    }
    filled.push(meta);
  }
  for (const existing of model.list()) {
    if (!existing.empty && !filled.some((meta) => meta.id === existing.id)) model.clear(existing.id);
  }
  return { kind: "refreshed", saved, filled, skipped, unreadable };
}

/**
 * Adapt a {@link GameSave} as a {@link SaveSlotSource}. Kept separate so a host can supply its own
 * reader (a cloud endpoint listing saves) with the same shape.
 */
export function gameSaveSlotSource(save: GameSave): SaveSlotSource {
  return {
    slots: () => save.slots(),
    peek: (slot) => save.peek(slot),
  };
}
