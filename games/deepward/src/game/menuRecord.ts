import type { GameSaveDocument } from "@jgengine/core/save/saveDocument";
import { refreshSaveSlots, type SaveSlotSource } from "@jgengine/core/save/saveSlotIndex";
import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { recordOf } from "./controls";
import { recordProfile, RECORD_LABEL, RECORD_SLOTS, type RecordSession, type RunSnapshot } from "./save";
import { clockText, roomOf, type Home } from "./state";
import { LITTLES } from "./littles";

/** The burrow list the menu shows: the game's own save documents, indexed through the shared save-slot index. */
export const recordSlots = createSaveSlots({ capacity: RECORD_SLOTS.length, slots: RECORD_SLOTS.map((id) => ({ id, empty: true, meta: {} })) });

/** The record's own words for where it stands: the room, the clock and what is carried. */
function runChips(snap: RunSnapshot, home: Home): Record<string, string> {
  const run = snap.run;
  if (run === null || snap.mode === "home") return { where: "In the burrow", stash: `${home.stash.length} stashed`, caps: `${home.caps} caps` };
  const plan = roomOf(run);
  return { where: `${plan.template.name} · ${plan.depth} deep`, clock: clockText(run), carried: `${run.pack.length} carried`, little: LITTLES[run.little].name };
}
function chipsOf(_slot: string, document: GameSaveDocument): Record<string, string> {
  const home = (document.systems["burrow"] ?? null) as Home | null;
  const snap = (document.systems["run"] ?? null) as RunSnapshot | null;
  const profile = (document.systems["profile"] ?? {}) as { thumbnail?: unknown };
  if (home === null) return {};
  const chips = snap === null ? { where: "In the burrow", stash: `${home.stash.length} stashed`, caps: `${home.caps} caps` } : runChips(snap, home);
  return { ...chips, runs: `${home.extractions} home safe`, ...(typeof profile.thumbnail === "string" && profile.thumbnail.length > 0 ? { thumbnail: profile.thumbnail } : {}) };
}
function nameOf(_slot: string, document: GameSaveDocument): string {
  const home = (document.systems["burrow"] ?? null) as Home | null;
  const snap = (document.systems["run"] ?? null) as RunSnapshot | null;
  if (home === null) return "A burrow";
  const name = home.callsign?.trim() || "The burrow";
  if (snap !== null && snap.run !== null && snap.mode !== "home") return `${name} · ${LITTLES[snap.run.little].name} is out in the house`;
  return `${name} · night ${home.nextRun}`;
}
function recordSource(record: RecordSession): SaveSlotSource { return { slots: () => record.slots(), peek: (slot) => record.peek(slot) }; }
export async function refreshRecordSlots(ctx: GameContext): Promise<void> {
  const record = recordOf(ctx);
  if (record === null) return;
  await refreshSaveSlots(recordSource(record), recordSlots, { nameOf, metaOf: chipsOf });
}
/** Capture the frame the record leaves behind for its card. */
export async function captureRecordThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180 });
  if (shot.ok) recordProfile.thumbnail = shot.thumbnail;
  return recordProfile.thumbnail;
}
export function recordLabel(slot: string): string { return RECORD_LABEL[slot] ?? slot; }
