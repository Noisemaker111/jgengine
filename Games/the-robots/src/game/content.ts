import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { GRENADE } from "./items/use-handlers";
import { enemies, enemyWeapons, npcs } from "./entities/enemies/catalog";
import { players } from "./entities/players/catalog";
import { gearById } from "./items/gear/catalog";
import { gunById } from "./handroll";
import { worldObjectById } from "./objects/catalog";

const playersById = new Map(players.map((entry) => [entry.id, entry]));
const enemiesById = new Map(enemies.map((entry) => [entry.id, entry]));
const npcsById = new Map(npcs.map((entry) => [entry.id, entry]));
const enemyWeaponsById = new Map(enemyWeapons.map((entry) => [entry.id, entry]));

type WeaponRecord = Record<string, number | Record<string, number>>;

function toWeaponRecord(stats: object): WeaponRecord {
  const record: WeaponRecord = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === "number") record[key] = value;
    else if (typeof value === "object" && value !== null) record[key] = { ...(value as Record<string, number>) };
  }
  return record;
}

function itemById(itemId: string): GameContextItemEntry | null {
  const gun = gunById(itemId);
  if (gun !== undefined) {
    return { use: gun.use, weapon: toWeaponRecord(gun.weapon), rarity: gun.rarity, baseType: gun.family };
  }
  if (itemId === "frag_grenade") {
    return {
      weapon: {
        damage: GRENADE.damage,
        range: 30,
        spread: 0.4,
        projectile: { speed: GRENADE.speed, fuseTime: GRENADE.fuseTime },
        explosion: { radius: GRENADE.radius },
      },
    };
  }
  const gear = gearById(itemId);
  if (gear !== undefined) {
    return { use: gear.use, trade: gear.trade, rarity: "common", baseType: gear.kind };
  }
  const bolt = enemyWeaponsById.get(itemId);
  if (bolt !== undefined) return { weapon: toWeaponRecord(bolt.weapon) };
  return null;
}

function entityById(catalogId: string): GameContextEntityEntry | null {
  const playerDef = playersById.get(catalogId);
  if (playerDef !== undefined) {
    return {
      stats: playerDef.stats,
      receive: playerDef.receive,
      movement: { poses: playerDef.poses, walkSpeed: playerDef.walkSpeed },
    };
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
  const npc = npcsById.get(catalogId);
  if (npc !== undefined) return { stats: npc.stats, role: "npc" };
  return null;
}

function objectById(catalogId: string): GameContextObjectEntry | null {
  return worldObjectById(catalogId) !== undefined ? {} : null;
}

export const content: GameContextContent = { itemById, entityById, objectById };

export function itemNameById(itemId: string): string {
  return gunById(itemId)?.name ?? gearById(itemId)?.name ?? itemId;
}
