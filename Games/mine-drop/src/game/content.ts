import type {
  GameContextContent,
  GameContextEntityEntry,
} from "@jgengine/core/runtime/gameContext";

import { BOMB_SPRITE, FLAG_SPRITE, NUMBER_SPRITE_PREFIX } from "./assets";
import { COMPANION_IDS, PLAYER_WALK_SPEED } from "./tuning";

export const PLAYER_CATALOG = "mine-person";

const entries = new Map<string, GameContextEntityEntry>();

entries.set(PLAYER_CATALOG, {
  movement: { poses: ["standing"], walkSpeed: PLAYER_WALK_SPEED },
  role: "player",
});

for (const id of COMPANION_IDS) {
  entries.set(id, { movement: { poses: ["standing"], walkSpeed: PLAYER_WALK_SPEED * 0.9 }, role: "npc" });
}

// Cosmetic billboard props (numbers, bombs, flags) — no stats, no movement.
for (let n = 1; n <= 8; n += 1) entries.set(`${NUMBER_SPRITE_PREFIX}${n}`, { role: "npc" });
entries.set(BOMB_SPRITE, { role: "npc" });
entries.set(FLAG_SPRITE, { role: "npc" });

export const content: GameContextContent = {
  entityById: (catalogId) => entries.get(catalogId) ?? null,
};
