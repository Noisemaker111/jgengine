import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextItemEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";
import { keybind, proximityPrompt } from "@jgengine/core/interaction/proximityPrompt";
import {
  HARDWARE_CATALOG,
  HARDWARE_MODEL_ID_VALUES,
  RACK_CATALOG,
  RACK_COOLING_CATALOG,
  RACK_COOLING_UNIT_ID_VALUES,
} from "@llmville/game/infrastructure/catalog";
import { DECOR_CATALOG } from "@llmville/game/store/decorCatalog";
import { getBuildItemFootprint } from "@llmville/game/build/geometry";
import { INTERACTION_TARGET_RADIUS } from "@llmville/game/world/bounds";

export const LOCAL_PLAYER_CATALOG_ID = "local-player";
export const LOCAL_PLAYER_WALK_SPEED = 2;
export const LLMVILLE_SHOP_ID = "store";

const RACK_HALF_HEIGHT = 1;
const DECOR_HALF_HEIGHT = 0.5;

function footprintHalfExtents(id: string, halfHeight: number): readonly [number, number, number] {
  const footprint = getBuildItemFootprint(id as Parameters<typeof getBuildItemFootprint>[0]);
  return [footprint.width / 2, halfHeight, footprint.depth / 2];
}

const OBJECT_ENTRIES: ReadonlyMap<string, GameContextObjectEntry> = new Map([
  ...RACK_CATALOG.map((rack): [string, GameContextObjectEntry] => [
    rack.id,
    {
      slotInventory: { slots: rack.slotCapacity, accepts: HARDWARE_MODEL_ID_VALUES },
      proximityPrompt: proximityPrompt({
        radius: INTERACTION_TARGET_RADIUS,
        display: keybind("interact"),
        invoke: null,
      }),
      halfExtents: footprintHalfExtents(rack.id, RACK_HALF_HEIGHT),
    },
  ]),
  ...DECOR_CATALOG.map((decor): [string, GameContextObjectEntry] => [
    decor.id,
    {
      proximityPrompt: proximityPrompt({
        radius: INTERACTION_TARGET_RADIUS,
        display: keybind("interact"),
        invoke: null,
      }),
      halfExtents: footprintHalfExtents(decor.id, DECOR_HALF_HEIGHT),
    },
  ]),
]);

const ITEM_ENTRIES: ReadonlyMap<string, GameContextItemEntry> = new Map([
  ...HARDWARE_CATALOG.map((hardware): [string, GameContextItemEntry] => [
    hardware.id,
    { trade: { buy: { money: hardware.buyPrice }, shops: [LLMVILLE_SHOP_ID] }, baseType: "hardware" },
  ]),
  ...RACK_COOLING_CATALOG.map((cooling): [string, GameContextItemEntry] => [
    cooling.id,
    { trade: { buy: { money: cooling.buyPrice }, shops: [LLMVILLE_SHOP_ID] }, baseType: "cooling" },
  ]),
]);

const ENTITY_ENTRIES: ReadonlyMap<string, GameContextEntityEntry> = new Map([
  [LOCAL_PLAYER_CATALOG_ID, { role: "player", movement: { walkSpeed: LOCAL_PLAYER_WALK_SPEED } }],
]);

export const RACK_SLOT_ACCEPTS = HARDWARE_MODEL_ID_VALUES;
export const RACK_COOLER_ACCEPTS = RACK_COOLING_UNIT_ID_VALUES;

export const llmvilleContent: GameContextContent = {
  objectById: (catalogId) => OBJECT_ENTRIES.get(catalogId) ?? null,
  itemById: (itemId) => ITEM_ENTRIES.get(itemId) ?? null,
  entityById: (catalogId) => ENTITY_ENTRIES.get(catalogId) ?? null,
};
