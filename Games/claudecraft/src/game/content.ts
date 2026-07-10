import type { LootTableDef } from "@jgengine/core/game/lootTable";
import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
} from "@jgengine/core/runtime/gameContext";

import { MOBS, mobById } from "./entities/enemies/catalog";
import { NPCS } from "./entities/npcs/catalog";
import { ITEMS, itemDefById } from "./items/catalog";
import { registerStackLimit } from "./inventories";
import { mobHp } from "./math/combat";
import { CLASS_ENTITY_ID, COPPER, type MobDef } from "./model";

for (const item of ITEMS) {
  if (item.stack !== undefined) registerStackLimit(item.id, item.stack);
}

const RECEIVE = {
  damage: { order: ["health"] },
  heal: { order: ["health"] },
};

function itemEntry(itemId: string): GameContextItemEntry | null {
  const item = itemDefById(itemId);
  if (item === null) return null;
  const trade =
    item.buyPrice === undefined && item.sellPrice === undefined
      ? undefined
      : {
          ...(item.buyPrice === undefined ? {} : { buy: { [COPPER]: item.buyPrice } }),
          ...(item.sellPrice === undefined ? {} : { sell: { [COPPER]: item.sellPrice } }),
          ...(item.shops === undefined ? {} : { shops: [...item.shops] }),
        };
  const use = item.kind === "consumable" ? "consume" : item.slot !== undefined ? "equip" : undefined;
  return {
    ...(use === undefined ? {} : { use }),
    ...(trade === undefined ? {} : { trade }),
    rarity: item.quality,
  };
}

function mobEntry(def: MobDef): GameContextEntityEntry {
  return {
    role: def.boss === true || def.rare === true ? "hostile" : "enemy",
    stats: {
      health: { max: mobHp(def.hpBase, def.hpPerLevel, def.maxLevel), min: 0 },
      level: { max: 60, min: 1, current: def.minLevel },
    },
    receive: RECEIVE,
    onDeath: { drops: [{ table: `coins:${def.id}` }, { table: `drops:${def.id}` }] },
    movement: { walkSpeed: def.moveSpeed },
  };
}

const npcIds = new Set(NPCS.map((npc) => npc.id));

export const content: GameContextContent = {
  itemById: itemEntry,
  entityById(catalogId) {
    if (catalogId === CLASS_ENTITY_ID) {
      return {
        role: "player",
        stats: {
          health: { max: 60, min: 0 },
          resource: { max: 100, min: 0, current: 0 },
          xp: { max: 400, min: 0, current: 0 },
          level: { max: 20, min: 1, current: 1 },
        },
        receive: RECEIVE,
        movement: { walkSpeed: 7 },
      };
    }
    const mob = mobById(catalogId);
    if (mob !== null) return mobEntry(mob);
    if (npcIds.has(catalogId)) return { role: "npc", movement: { walkSpeed: 2 } };
    return null;
  },
};

export function buildLootTables(): LootTableDef[] {
  const tables: LootTableDef[] = [];
  for (const def of MOBS) {
    const copperDrop = def.drops.find((drop) => drop.copper !== undefined);
    const range = copperDrop?.copper ?? [1, 3];
    tables.push({
      id: `coins:${def.id}`,
      entries: [{ currency: COPPER, count: [range[0], range[1]], weight: 1 }],
    });
    const itemDrops = def.drops.filter((drop) => drop.itemId !== undefined);
    const totalChance = itemDrops.reduce((sum, drop) => sum + drop.chance, 0);
    const scale = totalChance > 0.95 ? 0.95 / totalChance : 1;
    tables.push({
      id: `drops:${def.id}`,
      entries: [
        { currency: COPPER, count: 1, weight: Math.max(0.05, 1 - totalChance * scale) },
        ...itemDrops.map((drop) => ({
          item: drop.itemId as string,
          count: 1,
          weight: drop.chance * scale,
        })),
      ],
    });
  }
  return tables;
}
