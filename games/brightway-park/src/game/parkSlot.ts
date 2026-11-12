import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import { formatSavePlaytime } from "@jgengine/core/save/saveSlotIndex";
import { PARK_SLOT, parkSave, readParkSave, type ParkSave } from "./persistence";
import { parkProfile } from "./parkProfile";

const num = (save: ParkSave, key: string): number => {
  const value = save.world.facts[key];
  return typeof value === "number" ? value : 0;
};

export { captureParkThumb, parkProfile } from "./parkProfile";
/** Brightway keeps one park; the card is that document. */
export const parkSlots = createSaveSlots({
  capacity: 1,
  slots: [{ id: PARK_SLOT, empty: true, meta: {} }],
});

/** Read the saved park back into the card, so Continue and the slot grid show what is on disk. */
export async function refreshParkSlot(ctx: GameContext): Promise<void> {
  const document = await parkSave(ctx).peek(PARK_SLOT);
  const save = document === null ? null : readParkSave(document.systems["park"]);
  if (document === null || save === null) {
    parkSlots.clear(PARK_SLOT);
    return;
  }
  parkProfile.name = save.parkName ?? parkProfile.name;
  parkProfile.thumbnail = save.thumbnail ?? parkProfile.thumbnail;
  const playtime = typeof save.playtime === "number" ? save.playtime : 0;
  parkSlots.write(PARK_SLOT, {
    name: save.parkName ?? "Brightway Park",
    savedAt: document.savedAt > 0 ? document.savedAt : Date.now(),
    meta: {
      day: num(save, "park.day"),
      guests: Math.round(num(save, "park.guests_today")),
      cash: `$${Math.round(num(save, "park.cash")).toLocaleString()}`,
      playtime: formatSavePlaytime(playtime),
      ...(typeof save.thumbnail === "string" && save.thumbnail.length > 0 ? { thumbnail: save.thumbnail } : {}),
    },
  });
}
