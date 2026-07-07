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
  itemEntries.set(item.id, { use: item.use, weapon: item.weapon, rarity: item.rarity, baseType: item.kind });
  itemNames.set(item.id, item.name);
}

const entityEntries = new Map<string, GameContextEntityEntry>();
for (const p of players) {
  entityEntries.set(p.id, {
    stats: p.stats,
    receive: p.receive,
    movement: { poses: p.poses, walkSpeed: p.walkSpeed },
  });
}
for (const enemy of enemies) {
  entityEntries.set(enemy.id, {
    stats: enemy.stats,
    receive: enemy.receive,
    onDeath: enemy.onDeath,
    movement: { poses: ["standing"], walkSpeed: enemy.walkSpeed },
    role: "enemy",
  });
}

export const content: GameContextContent = {
  itemById: (itemId) => itemEntries.get(itemId) ?? null,
  entityById: (catalogId) => entityEntries.get(catalogId) ?? null,
};

export function itemNameById(itemId: string): string {
  return itemNames.get(itemId) ?? itemId;
}
