import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { requestSceneThumbnail } from "@jgengine/shell/render/sceneCaptureRequest";

import { bankOf, DRIVER, readCareer, standingOf } from "./career";
import { parkedRunMetres, parkedTrack, readParkedRun, type ParkedRun } from "./run/progress";
import { browserRecordStorage, readRecords, type RecordStorage } from "./run/records";
import { runSessionStore } from "./run/session";

/** The pit's one saved run. The corridor is one ladder, so the yard keeps one parked buggy. */
export const YARD_SLOT = "yard";
/** The frame and time the pit left behind, for the card Continue opens. */
export const PIT_FRAME_KEY = "drift-foundry.pit-frame.v1";
export interface PitFrame {
  thumbnail: string | null;
  savedAt: number;
}
export const pitFrame: PitFrame = { thumbnail: null, savedAt: 0 };

/** The card list the menu shows; its one slot is read from the game's own parked run. */
export const foundrySlots = createSaveSlots({ capacity: 1, slots: [{ id: YARD_SLOT, empty: true, meta: {} }] });

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function readPitFrame(storage: RecordStorage | undefined = browserRecordStorage()): PitFrame {
  try {
    const raw = JSON.parse(storage?.getItem(PIT_FRAME_KEY) ?? "null") as Partial<PitFrame> | null;
    if (raw === null || typeof raw !== "object") return { ...pitFrame };
    return {
      thumbnail: typeof raw.thumbnail === "string" && raw.thumbnail.length > 0 && raw.thumbnail.length <= 256 * 1024 ? raw.thumbnail : null,
      savedAt: nonnegative(raw.savedAt) ? raw.savedAt : 0,
    };
  } catch { return { ...pitFrame }; }
}

function writePitFrame(frame: PitFrame, storage: RecordStorage | undefined = browserRecordStorage()): boolean {
  try { storage?.setItem(PIT_FRAME_KEY, JSON.stringify(frame)); return storage !== undefined; }
  catch { return false; }
}

/** What the parked run is, in the yard's own words: where it stands, its clock, its build. */
function cardOf(parked: ParkedRun, storage: RecordStorage | undefined): { name: string; meta: Record<string, string | number>; savedAt: number } {
  const frame = readPitFrame(storage);
  const career = readCareer(storage);
  const records = readRecords(storage);
  const metres = Math.floor(parkedRunMetres(parked));
  const gate = Math.floor((parkedRunMetres(parked) / parkedTrack(parked).exitAt) * 100);
  return {
    name: `Parked at ${metres} m`,
    meta: {
      run: `Run ${readRunNumber(storage)}`,
      clock: `${parked.runTime.toFixed(1)} s`,
      build: `${parked.partIds.length} of 4 parts`,
      gate: `${gate}% of ${parkedTrack(parked).label}`,
      credits: `${bankOf(career).banked()} cr`,
      standing: `${standingOf(career).standing(DRIVER, "yard")} / ${standingOf(career).tier(DRIVER, "yard").id}`,
      records: `${records.escapes} escapes / ${records.attempts} runs`,
      ...(frame.thumbnail === null ? {} : { thumbnail: frame.thumbnail }),
    },
    savedAt: frame.savedAt,
  };
}

/** Which run the loop had open when the buggy parked; the card names it without inventing one. */
function readRunNumber(storage: RecordStorage | undefined): number {
  try {
    const raw = JSON.parse(storage?.getItem("drift-foundry.run.v1") ?? "null") as { run?: unknown } | null;
    return nonnegative(raw?.run) ? Math.floor(raw.run) : 1;
  } catch { return 1; }
}

/** Keep the card in step with the parked run on disk. */
export function refreshFoundrySlots(storage: RecordStorage | undefined = browserRecordStorage()): void {
  const parked = readParkedRun(storage);
  if (parked === null) {
    foundrySlots.clear(YARD_SLOT);
    return;
  }
  const card = cardOf(parked, storage);
  foundrySlots.write(YARD_SLOT, { name: card.name, meta: card.meta, savedAt: card.savedAt });
}

/**
 * Capture the frame the pit leaves behind. `requestSceneThumbnail` waits for the canvas binding and
 * its first painted frame itself, so there is no retry loop here.
 */
export async function capturePitFrame(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180 });
  if (shot.ok) pitFrame.thumbnail = shot.thumbnail;
  return pitFrame.thumbnail;
}

/** Park the stopped buggy, then write the card's frame and the run it points at. */
export async function saveParkedRunHere(ctx: GameContext): Promise<boolean> {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return false;
  if (!session.park()) return false;
  pitFrame.thumbnail = readPitFrame().thumbnail;
  await capturePitFrame();
  pitFrame.savedAt = Date.now();
  writePitFrame({ ...pitFrame });
  refreshFoundrySlots();
  return true;
}

/** The parked run Continue resumes, or `null` when the yard has none. */
export function parkedRunCard(): { id: string } | null {
  const recent = foundrySlots.mostRecent();
  return recent === null ? null : { id: recent.id };
}
