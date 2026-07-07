import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
} from "@jgengine/core/runtime/gameContext";
import { abilities } from "./items/abilities/catalog";
import { consumables } from "./items/consumables/catalog";
import { tools } from "./items/tools/catalog";
import { players } from "./entities/players/catalog";
import { enemies } from "./entities/enemies/catalog";
import { npcs } from "./entities/npcs/catalog";

const itemEntries = new Map<string, GameContextItemEntry>();
const itemNames = new Map<string, string>();
for (const item of [...abilities, ...consumables, ...tools]) {
  itemEntries.set(item.id, { use: item.use, weapon: item.weapon });
  itemNames.set(item.id, item.name);
}

const entityEntries = new Map<string, GameContextEntityEntry>();
const entityNames = new Map<string, string>();
for (const player of players) {
  entityEntries.set(player.id, {
    stats: player.stats,
    receive: player.receive,
    movement: { poses: player.poses, walkSpeed: player.walkSpeed },
  });
  entityNames.set(player.id, player.name);
}
for (const enemy of enemies) {
  entityEntries.set(enemy.id, {
    stats: enemy.stats,
    receive: enemy.receive,
    onDeath: enemy.onDeath,
    movement: { poses: ["standing"], walkSpeed: enemy.walkSpeed },
    role: "enemy",
  });
  entityNames.set(enemy.id, enemy.name);
}
for (const npc of npcs) {
  entityEntries.set(npc.id, { movement: { poses: ["standing"] } });
  entityNames.set(npc.id, npc.name);
}

export const content: GameContextContent = {
  itemById: (itemId) => itemEntries.get(itemId) ?? null,
  entityById: (catalogId) => entityEntries.get(catalogId) ?? null,
};

export function itemNameById(itemId: string): string {
  return itemNames.get(itemId) ?? itemId;
}

export function entityNameById(catalogId: string): string {
  return entityNames.get(catalogId) ?? catalogId;
}

export function itemCooldownById(itemId: string): number {
  const cooldown = itemEntries.get(itemId)?.weapon?.cooldownSeconds;
  return typeof cooldown === "number" ? cooldown : 0;
}
