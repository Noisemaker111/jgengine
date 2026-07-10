import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { CREATURE_IDS } from "./entities/creatures/catalog";
import { SHEPHERD_ENTITY_ID, SHEPHERD_WALK_SPEED } from "./entities/shepherd/catalog";
import { VEHICLE_TYPE_IDS } from "./vehicles/catalog";

const creatureIdSet = new Set<string>(CREATURE_IDS);
const vehicleIdSet = new Set<string>(VEHICLE_TYPE_IDS);

function entityById(catalogId: string): GameContextEntityEntry | undefined {
  if (catalogId === SHEPHERD_ENTITY_ID) {
    return { role: "player", movement: { walkSpeed: SHEPHERD_WALK_SPEED } };
  }
  if (creatureIdSet.has(catalogId)) return { role: "npc" };
  if (vehicleIdSet.has(catalogId)) return { role: "vehicle" };
  return undefined;
}

export const content: GameContextContent = { entityById };
