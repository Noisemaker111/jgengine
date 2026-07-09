import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
} from "@jgengine/core/runtime/gameContext";
import { weaponItems } from "./items/weapons/catalog";
import { players } from "./entities/players/catalog";
import { enemies } from "./entities/enemies/catalog";

const itemEntries = new Map<string, GameContextItemEntry>();
const itemNames = new Map<string, string>();
for (const item of weaponItems) {
  itemEntries.set(item.id, { use: item.use, weapon: item.weapon });
  itemNames.set(item.id, item.name);
}

const playersById = new Map(players.map((p) => [p.id, p]));
const enemiesById = new Map(enemies.map((enemy) => [enemy.id, enemy]));

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

export const content: GameContextContent = {
  itemById: (itemId) => itemEntries.get(itemId) ?? null,
  entityById,
};

export function itemNameById(itemId: string): string {
  return itemNames.get(itemId) ?? itemId;
}
