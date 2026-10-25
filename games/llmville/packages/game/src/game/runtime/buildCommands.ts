import { claimTerritory, territoryOwnerOf, territoryChunkKeys } from "@jgengine/core/world/territory";
import { buildPlacementReach, MAX_BUILD_PLACEMENT_REACH, getPlacementBounds } from "@llmville/game/build/build";
import { cellsForBounds } from "@llmville/game/datacenter/grid";
import { worldChunkKeysInRadius } from "@llmville/game/datacenter/worldChunks";
import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import type { PlacementPreviewContext } from "@llmville/game/build/build";
import {
  BUILD_ERRORS,
  decidePickupBuildItem,
  decidePlaceBuildItem,
  type PickupBuildItemDecision,
  type PlaceBuildItemDecision,
} from "@llmville/game/build/buildTransition";
import { isBuildItemId, normalizeBuildInventory } from "@llmville/game/build/catalog";
import { TERRITORY_POLICY } from "@llmville/game/datacenter/claims";
import {
  createPlacedDecorObject,
  createPlacedRackObject,
  findPlacedObject,
  insertPlacedObject,
  listPlacedObjects,
  placedObjectInstanceId,
  removePlacedObject,
  type PlacedObject,
} from "@llmville/game/datacenter/placedObjects";
import {
  isRecord,
  readCardinalDirection,
  readFiniteNumber,
  readPoint2,
  readPoint3,
  readString,
} from "@llmville/game/game/runtime/commandInput";
import { readSnapshotStock, writeSnapshotStock, STOCK_ID } from "@llmville/game/inventory/stock";
import type { CardinalDirection } from "@llmville/game/world/cardinal";

export const PLACE_BUILD_ITEM_COMMAND = "placeBuildItem";
export const PICKUP_BUILD_ITEM_COMMAND = "pickupBuildItem";

const UNKNOWN_PLAYER = "Unknown player";
const MALFORMED_INPUT = "Malformed command input";

export interface PlaceBuildItemCommandInput {
  itemId: string;
  position: { x: number; y: number; z: number };
  direction: CardinalDirection;
  now: number;
}

export interface PickupBuildItemCommandInput {
  itemId: string;
  player: { x: number; z: number };
}

function parsePlaceInput(input: unknown): PlaceBuildItemCommandInput | null {
  if (!isRecord(input)) return null;
  const itemId = readString(input.itemId);
  const position = readPoint3(input.position);
  const direction = readCardinalDirection(input.direction);
  const now = readFiniteNumber(input.now);
  if (itemId === null || position === null || direction === null || now === null) {
    return null;
  }
  return { itemId, position, direction, now };
}

function parsePickupInput(input: unknown): PickupBuildItemCommandInput | null {
  if (!isRecord(input)) return null;
  const itemId = readString(input.itemId);
  const player = readPoint2(input.player);
  return itemId === null || player === null ? null : { itemId, player };
}

function placementContext(
  snapshot: GameRuntimeSnapshot,
  userId: string,
): Omit<PlacementPreviewContext, "itemId" | "direction"> {
  const objects = listPlacedObjects(snapshot);
  return {
    racks: objects
      .filter((object): object is Extract<PlacedObject, { kind: "rack" }> => object.kind === "rack")
      .map((rack) => ({
        rackType: rack.rackType,
        x: rack.position.x,
        z: rack.position.z,
        rotationY: rack.rotationY,
      })),
    placedBuildItems: objects
      .filter((object): object is Extract<PlacedObject, { kind: "decor" }> => object.kind === "decor")
      .map((decor) => ({
        itemId: decor.itemId,
        x: decor.position.x,
        z: decor.position.z,
        direction: decor.direction,
      })),
    cellPolicy: { canUse: cell => territoryOwnerOf(snapshot, { x: cell.cx, z: cell.cz }, TERRITORY_POLICY) === userId, quote: () => ({ newCells: [], totalCost: 0 }) },
  };
}

function decidePlace(
  snapshot: GameRuntimeSnapshot,
  input: PlaceBuildItemCommandInput,
  actorUserId: string,
): PlaceBuildItemDecision {
  return decidePlaceBuildItem({
    itemId: input.itemId,
    position: input.position,
    direction: input.direction,
    inventory: normalizeBuildInventory(readSnapshotStock(snapshot, actorUserId, STOCK_ID.build)),
    context: placementContext(snapshot, actorUserId),
    createdBy: actorUserId,
    now: input.now,
  });
}

function decidePickup(
  snapshot: GameRuntimeSnapshot,
  input: PickupBuildItemCommandInput,
  actorUserId: string,
): PickupBuildItemDecision {
  const owned = listPlacedObjects(snapshot).filter((object) => object.ownerUserId === actorUserId);
  return decidePickupBuildItem({
    itemId: input.itemId,
    player: input.player,
    racks: owned
      .filter((object): object is Extract<PlacedObject, { kind: "rack" }> => object.kind === "rack")
      .map((rack) => ({
        id: rack.instanceId,
        rackType: rack.rackType,
        x: rack.position.x,
        z: rack.position.z,
        installedHardwareCount: rack.installedHardwareModuleIds.filter((slot) => slot !== null).length,
      })),
    placedBuildItems: owned
      .filter((object): object is Extract<PlacedObject, { kind: "decor" }> => object.kind === "decor")
      .map((decor) => ({ id: decor.instanceId, itemId: decor.itemId, x: decor.position.x, z: decor.position.z })),
    inventory: normalizeBuildInventory(readSnapshotStock(snapshot, actorUserId, STOCK_ID.build)),
  });
}

function footprint(input: PlaceBuildItemCommandInput) {
  return cellsForBounds(getPlacementBounds(input.itemId, input.position, input.direction)).map(cell => ({ x: cell.cx, z: cell.cz }));
}
function withClaims(snapshot: GameRuntimeSnapshot, input: PlaceBuildItemCommandInput, actorUserId: string) {
  return claimTerritory(snapshot, actorUserId, footprint(input), { ...TERRITORY_POLICY, nowMs: input.now });
}

export const placeBuildItemCommand: CommandDef = {
  scope: input => {
    const parsed = parsePlaceInput(input);
    return { players: "actor", chunkKeys: parsed ? [...new Set([...worldChunkKeysInRadius(parsed.position, buildPlacementReach(parsed.itemId) + MAX_BUILD_PLACEMENT_REACH), ...territoryChunkKeys(footprint(parsed), TERRITORY_POLICY)])] : [] };
  },
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parsePlaceInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    if (!isBuildItemId(parsed.itemId)) return { reason: BUILD_ERRORS.unknownItem };
    if (findPlacedObject(snapshot, placedObjectInstanceId(parsed.position)) !== null) {
      return { reason: BUILD_ERRORS.invalidPlacement };
    }
    const territory = withClaims(snapshot, parsed, actorUserId);
    if (!territory.ok) return { reason: territory.reason };
    const decision = decidePlace(territory.snapshot, parsed, actorUserId);
    return decision.placed ? null : { reason: decision.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parsePlaceInput(input);
    if (parsed === null) return snapshot;
    const territory = withClaims(snapshot, parsed, actorUserId);
    if (!territory.ok) return snapshot;
    const decision = decidePlace(territory.snapshot, parsed, actorUserId);
    if (!decision.placed) return snapshot;
    const object: PlacedObject =
      decision.row.kind === "rack"
        ? createPlacedRackObject({
            rackType: decision.row.rack.rackType,
            position: parsed.position,
            direction: parsed.direction,
            ownerUserId: actorUserId,
            placedAt: parsed.now,
          })
        : createPlacedDecorObject({
            itemId: decision.row.item.itemId,
            position: parsed.position,
            direction: parsed.direction,
            ownerUserId: actorUserId,
            placedAt: parsed.now,
          });
    return writeSnapshotStock(
      insertPlacedObject(territory.snapshot, object),
      actorUserId,
      STOCK_ID.build,
      decision.inventory,
    );
  },
};

export const pickupBuildItemCommand: CommandDef = {
  scope: () => ({ players: "actor" }),
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parsePickupInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const decision = decidePickup(snapshot, parsed, actorUserId);
    return decision.pickedUp ? null : { reason: decision.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parsePickupInput(input);
    if (parsed === null) return snapshot;
    const decision = decidePickup(snapshot, parsed, actorUserId);
    if (!decision.pickedUp) return snapshot;
    const object = findPlacedObject(snapshot, decision.target.id)?.object;
    let next = removePlacedObject(snapshot, decision.target.id);
    if (object?.kind === "rack") {
      const hardware = { ...readSnapshotStock(next, actorUserId, STOCK_ID.hardware) };
      for (const id of object.installedHardwareModuleIds) {
        if (id !== null) hardware[id] = (hardware[id] ?? 0) + 1;
      }
      next = writeSnapshotStock(next, actorUserId, STOCK_ID.hardware, hardware);
      if (object.installedCoolerId !== null) {
        const cooling = { ...readSnapshotStock(next, actorUserId, STOCK_ID.cooling) };
        cooling[object.installedCoolerId] = (cooling[object.installedCoolerId] ?? 0) + 1;
        next = writeSnapshotStock(next, actorUserId, STOCK_ID.cooling, cooling);
      }
    }
    return writeSnapshotStock(
      next,
      actorUserId,
      STOCK_ID.build,
      decision.inventory,
    );
  },
};
