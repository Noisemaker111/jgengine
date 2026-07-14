import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { enemies, enemyWeapons } from "./entities/enemies/catalog";
import { players } from "./entities/players/catalog";
import { gearItems } from "./items/gear/catalog";
import { relicById } from "./items/relics/catalog";
import { weapons, type WeaponStats } from "./items/weapons/catalog";
import { coverObjects } from "./objects/catalog";

const playersById = new Map(players.map((p) => [p.id, p]));
const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
const weaponsById = new Map(weapons.map((weapon) => [weapon.id, weapon]));
const gearItemsById = new Map(gearItems.map((item) => [item.id, item]));
const enemyWeaponsById = new Map(enemyWeapons.map((item) => [item.id, item]));
const coverById = new Map(coverObjects.map((object) => [object.id, object]));

type WeaponRecord = Record<string, number | Record<string, number>>;

function toWeaponRecord(stats: WeaponStats | { damage: number; range: number; spread: number; projectile?: { speed: number } }): WeaponRecord {
  const record: WeaponRecord = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number") record[key] = value;
    else if (typeof value === "object" && value !== null) record[key] = { ...value };
  }
  return record;
}

function itemById(itemId: string): GameContextItemEntry | null {
  const weapon = weaponsById.get(itemId);
  if (weapon !== undefined) {
    return {
      use: weapon.use,
      weapon: toWeaponRecord(weapon.weapon),
      rarity: weapon.rarity,
      baseType: weapon.family,
    };
  }
  const gear = gearItemsById.get(itemId);
  if (gear !== undefined) {
    return {
      use: gear.use,
      weapon: gear.weapon === undefined ? undefined : toWeaponRecord(gear.weapon),
      trade: gear.trade,
      rarity: "common",
      baseType: gear.kind,
    };
  }
  const bolt = enemyWeaponsById.get(itemId);
  if (bolt !== undefined) {
    return { weapon: toWeaponRecord(bolt.weapon) };
  }
  const relic = relicById(itemId);
  if (relic !== undefined) {
    return { rarity: relic.rarity, baseType: "relic" };
  }
  return null;
}

function entityById(catalogId: string): GameContextEntityEntry | null {
  const p = playersById.get(catalogId);
  if (p !== undefined) {
    return { stats: p.stats, receive: p.receive, movement: { poses: p.poses, walkSpeed: p.walkSpeed } };
  }
  const enemy = enemiesById.get(catalogId);
  if (enemy !== undefined) {
    return {
      stats: enemy.stats,
      receive: enemy.receive,
      onDeath: enemy.onDeath,
      movement: { poses: ["standing"], walkSpeed: enemy.walkSpeed },
      role: "enemy",
    };
  }
  return null;
}

function objectById(catalogId: string): GameContextObjectEntry | null {
  return coverById.has(catalogId) ? {} : null;
}

export const content: GameContextContent = { itemById, entityById, objectById };

export function itemNameById(itemId: string): string {
  return weaponsById.get(itemId)?.name ?? gearItemsById.get(itemId)?.name ?? relicById(itemId)?.name ?? itemId;
}
