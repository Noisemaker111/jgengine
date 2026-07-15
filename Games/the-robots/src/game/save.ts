import { createSaveStore, localSaveBackend, type SaveStore } from "@jgengine/core/game/saveStore";
import type { TalentSnapshot } from "@jgengine/core/game/talents";

import { session } from "./session";

export interface RobotsSave {
  characterId: string | null;
  talents: TalentSnapshot | null;
}

const EMPTY_SAVE: RobotsSave = { characterId: null, talents: null };
const SLOT_STORES = new Map<number, SaveStore<RobotsSave>>();

export function saveStoreForSlot(slot: number): SaveStore<RobotsSave> {
  const existing = SLOT_STORES.get(slot);
  if (existing !== undefined) return existing;
  const store = createSaveStore<RobotsSave>({
    backend: localSaveBackend(),
    key: "the-robots",
    slot: `slot-${slot}`,
    initial: EMPTY_SAVE,
    autosave: { debounceMs: 400 },
  });
  SLOT_STORES.set(slot, store);
  return store;
}

export function currentSaveStore(): SaveStore<RobotsSave> {
  return saveStoreForSlot(session.selectedSlot());
}
