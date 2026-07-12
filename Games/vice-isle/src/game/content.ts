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
import { objectById as objectDefById } from "./objects/catalog";

type WeaponRecord = Record<string, number | Record<string, number>>;

function weaponRecord(stats: { damage: number; projectile?: { mass: number; gravity: number; fuseTime: number }; explosion?: { radius: number } }): WeaponRecord {
  const record: WeaponRecord = { damage: stats.damage };
  if (stats.projectile !== undefined) record.projectile = { ...stats.projectile };
  if (stats.explosion !== undefined) record.explosion = { ...stats.explosion };
  return record;
}

function itemById(itemId: string): GameContextItemEntry | null {
  const weapon = weaponById(itemId);
  if (weapon !== undefined) {
    return { use: weapon.use, weapon: weaponRecord(weapon.weapon), trade: weapon.trade };
  }
  const gear = gearById(itemId);
  if (gear !== undefined) {
    return { use: gear.use, trade: gear.trade };
  }
  return null;
}

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === playerCatalog.id) return playerCatalog;
  const enemy = ENEMIES.find((e) => e.id === catalogId);
  if (enemy !== undefined) return enemyEntry(enemy);
  const npc = NPCS.find((n) => n.id === catalogId);
  if (npc !== undefined) return npcEntry(npc);
  if (VEHICLES.some((v) => v.id === catalogId)) return vehicleEntry();
  return null;
}

function objectById(catalogId: string): GameContextObjectEntry | null {
  const def = objectDefById(catalogId);
  if (def === undefined) return null;
  return {};
}

export const content: GameContextContent = { itemById, entityById, objectById };

export const ITEM_LABELS: Record<string, string> = Object.fromEntries([
  ...WEAPONS.map((w) => [w.id, w.label] as const),
  ...GEAR.map((g) => [g.id, g.label] as const),
]);
