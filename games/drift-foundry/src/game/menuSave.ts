import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import { requestSceneThumbnail } from "@jgengine/core/scene/sceneCaptureRequest.draw";

import { bankOf, DRIVER, standingOf } from "./career";
import { FOUNDRY_SLOT, foundrySaveOf, type FoundryProfile, type FoundrySave, type PitFrame } from "./foundrySave";
import { parkedRunMetres, parkedTrack, type ParkedRun } from "./run/progress";
import { runSessionStore } from "./run/session";

/** The pit's one saved run. The corridor is one ladder, so the yard keeps one parked buggy. */
export const YARD_SLOT = FOUNDRY_SLOT;
/** The frame and time the pit left behind, for the card Continue opens. */
export const pitFrame: PitFrame = { thumbnail: null, savedAt: 0 };

/** The card list the menu shows; its one slot is read from the yard document's parked run. */
export const foundrySlots = createSaveSlots({ capacity: 1, slots: [{ id: YARD_SLOT, empty: true, meta: {} }] });

/** What the parked run is, in the yard's own words: where it stands, its clock, its build. */
function cardOf(parked: ParkedRun, profile: FoundryProfile): { name: string; meta: Record<string, string | number>; savedAt: number } {
  const { pitFrame: frame, career, records } = profile;
  const metres = Math.floor(parkedRunMetres(parked));
  const gate = Math.floor((parkedRunMetres(parked) / parkedTrack(parked).exitAt) * 100);
  return {
    name: `Parked at ${metres} m`,
    meta: {
      // Which run the loop had open when the buggy parked; the card names it without inventing one.
      run: `Run ${Math.max(1, profile.run?.session ?? 1)}`,
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

/** Keep the card in step with the parked run in the yard's document. */
export async function refreshFoundrySlots(save: FoundrySave): Promise<void> {
  const profile = await save.peek();
  const parked = profile?.parked ?? null;
  if (profile === null || parked === null) {
    foundrySlots.clear(YARD_SLOT);
    return;
  }
  const card = cardOf(parked, profile);
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

/** Park the stopped buggy, then write the card's frame with the run it points at. */
export async function saveParkedRunHere(ctx: GameContext): Promise<boolean> {
  const session = runSessionStore.peek(ctx);
  if (session === undefined) return false;
  if (!session.park()) return false;
  const save = foundrySaveOf(ctx);
  pitFrame.thumbnail = save.profile.pitFrame.thumbnail;
  await capturePitFrame();
  pitFrame.savedAt = Date.now();
  save.profile.pitFrame = { ...pitFrame };
  await save.write();
  await refreshFoundrySlots(save);
  return true;
}

/** The parked run Continue resumes, or `null` when the yard has none. */
export function parkedRunCard(): { id: string } | null {
  const recent = foundrySlots.mostRecent();
  return recent === null ? null : { id: recent.id };
}
