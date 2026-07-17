import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";

import { combatantDef, DECOR, isNode } from "./catalog";
import { HERO_ID, HERO_STAT_SEED } from "./hero";

/**
 * Resolves an entity's runtime definition from the Ironhold roster. Combatants carry a `health`
 * pool and accept `damage` into it (that pairing is what drives the shell's world health bars and
 * the melee `effect("damage", …)` calls). Decorative props resolve as inert meshes — no health,
 * so no bar and nothing to kill. Positions come from the scene, never from here.
 */
function entityById(catalogId: string): GameContextEntityEntry | null {
  const def = combatantDef(catalogId);
  if (def !== null) {
    // The hero also carries mana + XP/level pools so the HUD reads them reactively and the
    // leveling primitive drives them; damage still lands only into `health`.
    const stats: StatCatalog = { health: { max: def.maxHealth } };
    if (catalogId === HERO_ID) Object.assign(stats, HERO_STAT_SEED);
    const entry: GameContextEntityEntry = {
      role: def.role,
      scale: def.scale,
      stats,
      receive: { damage: { order: ["health"] } },
    };
    if (def.walkSpeed > 0) entry.movement = { walkSpeed: def.walkSpeed };
    return entry;
  }
  if (DECOR.has(catalogId) || isNode(catalogId)) return { role: "npc" };
  return null;
}

export const content: GameContextContent = { entityById };
