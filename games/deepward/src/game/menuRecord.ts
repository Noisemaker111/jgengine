import type { GameSaveDocument } from "@jgengine/core/game/gameSave";
import { refreshSaveSlots, type SaveSlotSource } from "@jgengine/core/game/saveSlotIndex";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { requestSceneThumbnail } from "@jgengine/shell/render/sceneCaptureRequest";

import { depthAt, roomAt } from "../world";
import { loadOf } from "./haul";
import { recordOf } from "./controls";
import { recordProfile, RECORD_LABEL, RECORD_SLOTS, type RecordSession, type RunSnapshot } from "./save";
import type { Home } from "./state";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

/**
 * The record list the menu shows. The documents are the game's own save path (`openRecord`); this
 * index only carries what a card draws, refreshed through the shared save-slot index.
 */
export const recordSlots = createSaveSlots({
  capacity: RECORD_SLOTS.length,
  slots: RECORD_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/** A room's authored name without its depth prefix ("04 / the printhouse" reads as "the printhouse"). */
function roomName(room: string): string {
  return room.replace(/^\d+\s*\/\s*/, "");
}

/** The dive's own words for where it stands: its depth, its room and what it is carrying. */
function diveChips(run: RunSnapshot, home: Home): Record<string, string> {
  const dive = run.dive;
  if (dive === null || run.mode === "home") {
    return { depth: "At the home", haul: `${home.stash.length} banked`, life: `Life ${home.life}` };
  }
  const at = run.player ?? dive.print.at;
  const load = loadOf(dive.cache);
  return {
    depth: `Depth ${depthAt(at, "vault")} · ${roomName(roomAt(at, "vault"))}`,
    haul: `${dive.cache.length} carried · ${load.mass} kg`,
    life: `Life ${home.life}`,
  };
}

/** Read a record document into the words its card shows. */
function chipsOf(_slot: string, document: GameSaveDocument): Record<string, string> {
  const home = (document.systems.marrow ?? null) as Home | null;
  const run = (document.systems.run ?? null) as RunSnapshot | null;
  const profile = (document.systems.profile ?? {}) as { thumbnail?: unknown };
  if (home === null) return {};
  const chips = run === null ? { depth: "At the home", haul: `${home.stash.length} banked`, life: `Life ${home.life}` } : diveChips(run, home);
  return {
    ...chips,
    scrip: `${home.bank.banked} scrip`,
    ...(typeof profile.thumbnail === "string" && profile.thumbnail.length > 0 ? { thumbnail: profile.thumbnail } : {}),
  };
}

function nameOf(_slot: string, document: GameSaveDocument): string {
  const home = (document.systems.marrow ?? null) as Home | null;
  const run = (document.systems.run ?? null) as RunSnapshot | null;
  if (home === null) return "A Marrow record";
  if (run !== null && run.dive !== null && run.mode !== "home") return `Dive ${run.dive.id} · Life ${home.life}`;
  return `Halloway · Life ${home.life}`;
}

/** The record session's documents, as the shared index reads them. */
function recordSource(record: RecordSession): SaveSlotSource {
  return { slots: () => record.slots(), peek: (slot) => record.peek(slot) };
}

/** Keep the card list in step with the records on disk. */
export async function refreshRecordSlots(ctx: GameContext): Promise<void> {
  const record = recordOf(ctx);
  if (record === null) return;
  await refreshSaveSlots(recordSource(record), recordSlots, { nameOf, metaOf: chipsOf });
}

/**
 * Capture the frame the record leaves behind. `requestSceneCapture` waits for the canvas binding and
 * its first painted frame itself, so there is no retry loop here.
 */
export async function captureRecordThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180 });
  if (shot.ok) recordProfile.thumbnail = shot.thumbnail;
  return recordProfile.thumbnail;
}

/** The record's own name for a slot ("Record II"), never a raw storage key. */
export function recordLabel(slot: string): string {
  return RECORD_LABEL[slot] ?? slot;
}
