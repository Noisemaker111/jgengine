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
import { GEAR, WEAPONS, gearById, weaponById } from "./items/weapons/catalog";
import { marketGunById } from "./items/nightMarket";
import { objectById as objectDefById } from "./objects/catalog";

type WeaponRecord = Record<string, number | Record<string, number>>;

function weaponRecord(stats: { damage: number; projectile?: { mass: number; gravity: number; fuseTime: number }; explosion?: { radius: number } }): WeaponRecord {
  const record: WeaponRecord = { damage: stats.damage };
  if (stats.projectile !== undefined) record["projectile"] = { ...stats.projectile };
  if (stats.explosion !== undefined) record["explosion"] = { ...stats.explosion };
  return record;
}

/** The use and trade an entry carries, each only when the catalog sets it. */
function useAndTrade(def: { use?: GameContextItemEntry["use"] | undefined; trade?: GameContextItemEntry["trade"] | undefined }): GameContextItemEntry {
  return {
    ...(def.use === undefined ? {} : { use: def.use }),
    ...(def.trade === undefined ? {} : { trade: def.trade }),
  };
}

function itemById(itemId: string): GameContextItemEntry | null {
  const weapon = weaponById(itemId);
  if (weapon !== undefined) {
    return { ...useAndTrade(weapon), weapon: weaponRecord(weapon.weapon) };
  }
  const market = marketGunById(itemId);
  if (market !== null) {
    return { ...useAndTrade({ use: market.use }), weapon: weaponRecord(market.weapon) };
  }
  const gear = gearById(itemId);
  if (gear !== undefined) {
    return useAndTrade(gear);
  }
  return null;
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
const TRANSIENT_OBJECTS = new Set(["obj_delivery_1", "obj_delivery_2", "obj_delivery_3"]);

function objectById(catalogId: string): GameContextObjectEntry | null {
  const def = objectDefById(catalogId);
  if (def === undefined) return null;
  return TRANSIENT_OBJECTS.has(catalogId) ? {} : { scenery: true };
}

export const content: GameContextContent = { itemById, entityById, objectById };

export const ITEM_LABELS: Record<string, string> = Object.fromEntries([
  ...WEAPONS.map((w) => [w.id, w.label] as const),
  ...GEAR.map((g) => [g.id, g.label] as const),
]);
