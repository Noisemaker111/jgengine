import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { combatantDef, DECOR } from "./catalog";

/**
 * Resolves an entity's runtime definition from the Ironhold roster. Combatants carry a `health`
 * pool and accept `damage` into it (that pairing is what drives the shell's world health bars and
 * the melee `effect("damage", …)` calls). Decorative props resolve as inert meshes — no health,
 * so no bar and nothing to kill. Positions come from the scene, never from here.
 */
function entityById(catalogId: string): GameContextEntityEntry | null {
  const def = combatantDef(catalogId);
  if (def !== null) {
    const entry: GameContextEntityEntry = {
      role: def.role,
      scale: def.scale,
      stats: { health: { max: def.maxHealth } },
      receive: { damage: { order: ["health"] } },
    };
    if (def.walkSpeed > 0) entry.movement = { walkSpeed: def.walkSpeed };
    return entry;
  }
  if (DECOR.has(catalogId)) return { role: "npc" };
  return null;
}

export const content: GameContextContent = { entityById };
