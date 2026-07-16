import type { GameEvents } from "../../game/events";
import {
  createWorldItemStore,
  WORLD_ITEM_ENTITY_NAME,
  type WorldItemRecord,
  type WorldItemSpawnInput,
  type WorldItemStore,
} from "../../game/worldItem";
import type { Drop } from "../../game/lootTable";
import type { EntityStore } from "../../scene/entityStore";
import { notifyAfter } from "../../store/changeSignal";
import type { WorldItemPickupResult } from "../gameContext";

/** @internal What the ground-item surface needs from the live context: entity spawn/despawn, the event bus, loot granting, and change notification. */
export interface WorldItemContextDeps {
  entities: EntityStore;
  events: GameEvents;
  despawnEntity: (instanceId: string) => boolean;
  grantToPlayer: (userId: string, drops: Drop[], source?: string) => void;
  signalNotify: () => void;
}

/** @internal The `ctx.scene.worldItem` wiring: the reactive store plus the spawn/pickup verbs that emit `worldItem.*` events and route pickups through loot. */
export interface WorldItemContext {
  worldItems: WorldItemStore;
  spawnWorldItem(input: WorldItemSpawnInput): WorldItemRecord;
  pickupWorldItem(instanceId: string, userId: string): WorldItemPickupResult;
}

/** @internal */
export function createWorldItemContext(d: WorldItemContextDeps): WorldItemContext {
  const worldItems = notifyAfter(
    createWorldItemStore({
      spawnEntity: (position) => d.entities.spawn(WORLD_ITEM_ENTITY_NAME, { position, role: "prop" }),
      despawnEntity: d.despawnEntity,
      resolvePosition: (instanceId) => d.entities.get(instanceId)?.position,
    }),
    ["spawn", "take", "remove"],
    d.signalNotify,
  );

  function spawnWorldItem(input: WorldItemSpawnInput): WorldItemRecord {
    const record = worldItems.spawn(input);
    d.events.emit("worldItem.dropped", {
      instanceId: record.instanceId,
      itemId: record.itemId,
      rarity: record.rarity,
      count: record.count,
      position: [input.position[0], input.position[1], input.position[2]],
      ...(record.source !== undefined ? { source: record.source } : {}),
    });
    return record;
  }

  function pickupWorldItem(instanceId: string, userId: string): WorldItemPickupResult {
    const record = worldItems.take(instanceId);
    if (record === null) return { status: "rejected", reason: "not-found" };
    d.grantToPlayer(userId, [{ item: record.itemId, count: record.count }], "worldItem.pickup");
    d.events.emit("worldItem.picked_up", {
      instanceId,
      userId,
      itemId: record.itemId,
      rarity: record.rarity,
      count: record.count,
    });
    return { status: "ok", record };
  }

  return { worldItems, spawnWorldItem, pickupWorldItem };
}
