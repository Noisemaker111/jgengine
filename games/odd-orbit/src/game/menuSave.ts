import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { formatSavePlaytime } from "@jgengine/core/game/saveSlotIndex";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { requestSceneThumbnail } from "@jgengine/shell/render/sceneCaptureRequest";

import { ORBIT_SLOTS, ORBIT_SLOT_LABEL, orbitProfile, readOrbitSave, writeOrbitSave, type OrbitSave } from "./session/save";
import { orbitSession } from "./session/lifecycle";
import type { HouseholdState, MemberState } from "./session/types";

/**
 * The household list the menu shows. The documents are the game's own save path (`readOrbitSave`);
 * this index only carries what a card draws.
 */
export const orbitSlots = createSaveSlots({
  capacity: ORBIT_SLOTS.length,
  slots: ORBIT_SLOTS.map((id) => ({ id, empty: true, meta: {} })),
});

/** The household's own name for a slot ("Household II"), never a raw storage key. */
export function orbitSlotLabel(slot: string): string {
  return ORBIT_SLOT_LABEL[slot] ?? slot;
}

/** The member on paid work this shift, or `null` when the household is between shifts. */
export function workingMember(household: HouseholdState): MemberState | null {
  for (const id of household.order) {
    const member = household.members[id];
    if (member !== undefined && member.action.kind === "use" && member.action.goal === "work") return member;
  }
  return null;
}

/** The household's name: what the player typed, or its members when a legacy save never had one. */
export function householdName(household: HouseholdState, save?: OrbitSave): string {
  const written = save?.profile?.name ?? orbitProfile.name;
  if (written.trim().length > 0) return written.trim();
  const first = household.order.map((id) => household.members[id]).find((member) => member !== undefined);
  return first === undefined ? "An unnamed household" : `${first.name}'s household`;
}

/** The day and hour a household stands at, in the game's own words. */
function clockWords(save: OrbitSave): string {
  const { day, hour, minute } = save.clock.calendar;
  return `Day ${day + 1}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Read a household document into the words its card shows. */
function cardOf(slot: string, save: OrbitSave): { name: string; meta: Record<string, string | number>; savedAt: number } {
  const household = save.household;
  const working = workingMember(household);
  return {
    name: householdName(household, save),
    meta: {
      beings: `${household.order.length} beings`,
      shift: working === null ? "Between shifts" : `${working.name} on shift`,
      day: clockWords(save),
      credits: `${household.credits} credits`,
      ...(typeof save.profile?.thumbnail === "string" && save.profile.thumbnail.length > 0 ? { thumbnail: save.profile.thumbnail } : {}),
      playtime: formatSavePlaytime(save.clock.now),
    },
    savedAt: save.profile?.savedAt ?? 0,
  };
}

/** Keep the card list in step with the households on disk. */
export function refreshOrbitSlots(): void {
  for (const slot of ORBIT_SLOTS) {
    const { save } = readOrbitSave(undefined, slot);
    if (save === null) {
      orbitSlots.clear(slot);
      continue;
    }
    const card = cardOf(slot, save);
    orbitSlots.write(slot, { name: card.name, meta: card.meta, savedAt: card.savedAt });
  }
}

/**
 * Capture the frame the household leaves behind. `requestSceneThumbnail` waits for the canvas
 * binding and its first painted frame itself, so there is no retry loop here.
 */
export async function captureOrbitThumb(): Promise<string | null> {
  const shot = await requestSceneThumbnail({ width: 320, height: 180 });
  if (shot.ok) orbitProfile.thumbnail = shot.thumbnail;
  return orbitProfile.thumbnail;
}

/** Write the live household into the slot it belongs to, then re-read the cards. */
export async function saveOrbitSlot(ctx: GameContext): Promise<boolean> {
  await captureOrbitThumb();
  orbitProfile.savedAt = Date.now();
  const slot = orbitSession.read(ctx).slot;
  const written = writeOrbitSave(ctx, undefined, slot);
  refreshOrbitSlots();
  return written;
}

/** Open a kept household: the menu's own commands, so the world, clock and stores move together. */
export function openOrbitSlot(ctx: GameContext, slot: string): boolean {
  const { save } = readOrbitSave(undefined, slot);
  if (save === null) return false;
  ctx.game.commands.run("orbit.continue", { slot });
  refreshOrbitSlots();
  return true;
}

/** Begin a fresh household in the chosen slot. */
export function newOrbitSlot(ctx: GameContext, slot: string, name: string): void {
  ctx.game.commands.run("orbit.new", { slot, name });
  refreshOrbitSlots();
}

/** The household Continue resumes - the newest written slot, never a remembered flag. */
export function resumeOrbitSlot(): { id: string } | null {
  const recent = orbitSlots.mostRecent();
  return recent === null ? null : { id: recent.id };
}
