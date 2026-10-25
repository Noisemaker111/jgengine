import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/game/saveSlotIndex";

import { CHARACTERS } from "./characters";
import { scrapSave } from "./save";
import { scrapProfile } from "./scrapProfile";

/** The runs a reclaimer can keep: one per leg of the signal. */
export const SCRAP_SLOTS = [
  { id: "relay", label: "The Relay" },
  { id: "signal", label: "Cold Signal" },
  { id: "wastes", label: "The Wastes" },
] as const;

/** The kept-run index the menu reads. */
export const scrapSlots = createSaveSlots({
  capacity: SCRAP_SLOTS.length,
  slots: SCRAP_SLOTS.map((slot) => ({ id: slot.id, empty: true, meta: {} })),
});

function characterName(id: unknown): string | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return CHARACTERS.find((character) => character.id === id)?.name ?? null;
}

/** Read every kept run back into the cards, so Continue and the grid show what is on disk. */
export function refreshScrapSlots(ctx: GameContext): Promise<unknown> {
  return refreshSaveSlots(gameSaveSlotSource(scrapSave(ctx)), scrapSlots, {
    nameOf: (_slot, document) => {
      const character = (document.systems.character ?? {}) as { id?: string };
      const profile = (document.systems.profile ?? {}) as { name?: string | null };
      return profile.name ?? characterName(character.id) ?? "Reclaimer";
    },
    metaOf: (_slot, document) => {
      const character = (document.systems.character ?? {}) as { id?: string };
      const profile = (document.systems.profile ?? {}) as { name?: string | null; thumbnail?: string | null };
      const run = (document.systems.combat ?? {}) as { wave?: number };
      const relay = (document.systems.relay ?? {}) as { wave?: number };
      const name = profile.name ?? characterName(character.id);
      return {
        ...(name === null ? {} : { character: name }),
        ...(typeof relay.wave === "number" ? { relay: relay.wave } : {}),
        ...(typeof run.wave === "number" ? { wave: run.wave } : {}),
        playtime: formatSavePlaytime(document.playtime),
        ...(typeof profile.thumbnail === "string" ? { thumbnail: profile.thumbnail } : {}),
      };
    },
  });
}

/** The call sign a card shows before a name is typed. */
export function scrapNameFor(id: string | null): string | null {
  return characterName(id) ?? (scrapProfile.name ?? null);
}

