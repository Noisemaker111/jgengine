import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createSaveSlots } from "@jgengine/core/save/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/save/saveSlotIndex";

import { CHARACTERS } from "./characters";
import { scrapSave } from "./save";
import { scrapProfile } from "./scrapProfile";

export const SCRAP_SLOTS = [
  { id: "relay", label: "The Relay" },
  { id: "signal", label: "Cold Signal" },
  { id: "wastes", label: "The Wastes" },
] as const;

export const scrapSlots = createSaveSlots({
  capacity: SCRAP_SLOTS.length,
  slots: SCRAP_SLOTS.map((slot) => ({ id: slot.id, empty: true, meta: {} })),
});

function characterName(id: unknown): string | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return CHARACTERS.find((character) => character.id === id)?.name ?? null;
}

export function refreshScrapSlots(ctx: GameContext): Promise<unknown> {
  return refreshSaveSlots(gameSaveSlotSource(scrapSave(ctx)), scrapSlots, {
    nameOf: (_slot, document) => {
      const character = (document.systems["character"] ?? {}) as { id?: string };
      const profile = (document.systems["profile"] ?? {}) as { name?: string | null };
      return profile.name ?? characterName(character.id) ?? "Reclaimer";
    },
    metaOf: (_slot, document) => {
      const character = (document.systems["character"] ?? {}) as { id?: string };
      const profile = (document.systems["profile"] ?? {}) as { name?: string | null; thumbnail?: string | null };
      const run = (document.systems["combat"] ?? {}) as { wave?: number };
      const relay = (document.systems["relay"] ?? {}) as { wave?: number };
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

export function scrapNameFor(id: string | null): string | null {
  return characterName(id) ?? (scrapProfile.name ?? null);
}

