import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { ENEMIES, enemyEntry } from "./entities/enemies/catalog";
import { NPCS, npcEntry } from "./entities/npcs/catalog";
import { playerCatalog } from "./entities/players/catalog";
import { VEHICLES, vehicleEntry } from "./entities/vehicles/catalog";
import { GEAR, gearById } from "./items/gear";
import { objectById as objectDefById } from "./objects/catalog";

/** The use and trade an entry carries, each only when the catalog sets it. */
function useAndTrade(def: { use?: GameContextItemEntry["use"] | undefined; trade?: GameContextItemEntry["trade"] | undefined }): GameContextItemEntry {
  return {
    ...(def.use === undefined ? {} : { use: def.use }),
    ...(def.trade === undefined ? {} : { trade: def.trade }),
  };
}

function itemById(itemId: string): GameContextItemEntry | null {
  const gear = gearById(itemId);
  return gear === undefined ? null : useAndTrade(gear);
}

/** The boats in the bay and the helicopter over the city: scenery that moves along authored circuits. */
const AMBIENT_VESSELS: ReadonlySet<string> = new Set(["boat_sail", "boat_runabout", "heli_ambient"]);

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === playerCatalog.id) return playerCatalog;
  const enemy = ENEMIES.find((e) => e.id === catalogId);
  if (enemy !== undefined) return enemyEntry(enemy);
  const npc = NPCS.find((n) => n.id === catalogId);
  if (npc !== undefined) return npcEntry(npc);
  if (VEHICLES.some((v) => v.id === catalogId) || AMBIENT_VESSELS.has(catalogId)) return vehicleEntry();
  return null;
}

/** Placed per job and removed on delivery; everything else is fixed city dressing. */
const TRANSIENT_OBJECTS = new Set(["obj_delivery_1", "obj_delivery_2", "obj_delivery_3", "obj_order_beacon", "obj_tide_water", "obj_wake"]);

function objectById(catalogId: string): GameContextObjectEntry | null {
  const def = objectDefById(catalogId);
  if (def === undefined) return null;
  return TRANSIENT_OBJECTS.has(catalogId) ? {} : { scenery: true };
}

export const content: GameContextContent = { itemById, entityById, objectById };

export const ITEM_LABELS: Record<string, string> = Object.fromEntries([
  ...GEAR.map((g) => [g.id, g.label] as const),
]);
