import type {
  GameContextContent,
  GameContextEntityEntry,
} from "@jgengine/core/runtime/gameContext";

import { BOMB_SPRITE, FLAG_SPRITE, NUMBER_SPRITE_PREFIX } from "./assets";
import { COMPANION_IDS, PLAYER_WALK_SPEED } from "./tuning";

export const PLAYER_CATALOG = "mine-person";

const companionIds = new Set<string>(COMPANION_IDS);

// Cosmetic billboard props (numbers, bombs, flags) — no stats, no movement.
const propIds = new Set<string>([
  ...Array.from({ length: 8 }, (_, n) => `${NUMBER_SPRITE_PREFIX}${n + 1}`),
  BOMB_SPRITE,
  FLAG_SPRITE,
]);

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === PLAYER_CATALOG) {
    return { movement: { poses: ["standing"], walkSpeed: PLAYER_WALK_SPEED }, role: "player" };
  }
  if (companionIds.has(catalogId)) {
    return { movement: { poses: ["standing"], walkSpeed: PLAYER_WALK_SPEED * 0.9 }, role: "npc" };
  }
  if (propIds.has(catalogId)) return { role: "npc" };
  return null;
}

export const content: GameContextContent = {
  entityById,
};
