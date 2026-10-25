import { ownedClaimChunkKeys } from "../datacenter";
import type { RuntimeChunkRow } from "@jgengine/core/runtime/snapshot";
import {
  fromRuntimeObjectRow,
  placedRackAssignmentMap,
  placedRackSnapshots,
  removePlacedObject,
  type PlacedDecorObject,
  type PlacedObject,
  type PlacedRackObject,
} from "@llmville/game/datacenter/placedObjects";
import {
  worldChunkKeysInRadius,
  type WorldPoint,
} from "@llmville/game/datacenter/worldChunks";
import type { ComputeAssignmentMap, RackSnapshot } from "@llmville/game/infrastructure/infrastructure";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { helpers } from "./runtime";
import { worldServerRow } from "./world";

export type { PlacedObject, PlacedRackObject, PlacedDecorObject };

export interface SceneRack {
  id: string;
  ownerUserId: string;
  rackType: PlacedRackObject["rackType"];
  x: number;
  y: number;
  z: number;
  rotationY: number;
  installedHardwareModuleIds: PlacedRackObject["installedHardwareModuleIds"];
  installedCoolerId: PlacedRackObject["installedCoolerId"];
  state: PlacedRackObject["state"];
  createdAt: number;
}

export interface SceneBuildItem {
  id: string;
  ownerUserId: string;
  itemId: PlacedDecorObject["itemId"];
  x: number;
  y: number;
  z: number;
  direction: PlacedDecorObject["direction"];
}

export function toSceneRack(rack: PlacedRackObject): SceneRack {
  return {
    id: rack.instanceId,
    ownerUserId: rack.ownerUserId,
    rackType: rack.rackType,
    x: rack.position.x,
    y: rack.position.y,
    z: rack.position.z,
    rotationY: rack.rotationY,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
    installedCoolerId: rack.installedCoolerId,
    state: rack.state,
    createdAt: rack.placedAt,
  };
}

export function toSceneBuildItem(decor: PlacedDecorObject): SceneBuildItem {
  return {
    id: decor.instanceId,
    ownerUserId: decor.ownerUserId,
    itemId: decor.itemId,
    x: decor.position.x,
    y: decor.position.y,
    z: decor.position.z,
    direction: decor.direction,
  };
}

export function rackSnapshots(racks: readonly PlacedRackObject[]): RackSnapshot[] {
  return placedRackSnapshots(racks);
}

export function assignmentsOf(
  racks: readonly PlacedRackObject[],
  liveModelIds: ReadonlySet<string>,
): ComputeAssignmentMap {
  return placedRackAssignmentMap(racks, liveModelIds);
}

export function modelIdSet(models: readonly { _id: Id<"models"> }[]): ReadonlySet<string> {
  return new Set(models.map((model) => model._id as string));
}

export async function gameModelIds(
  ctx: QueryCtx,
  gameId: Id<"games">,
): Promise<ReadonlySet<string>> {
  return modelIdSet(
    await ctx.db
      .query("models")
      .withIndex("by_game_id", (q) => q.eq("gameId", gameId))
      .collect(),
  );
}

export function selectRacks(objects: readonly PlacedObject[]): PlacedRackObject[] {
  return objects.filter((object): object is PlacedRackObject => object.kind === "rack");
}

export function selectDecor(objects: readonly PlacedObject[]): PlacedDecorObject[] {
  return objects.filter((object): object is PlacedDecorObject => object.kind === "decor");
}

function objectsFromChunkRow(row: RuntimeChunkRow | undefined): PlacedObject[] {
  const objects: PlacedObject[] = [];
  for (const objectRow of row?.objects ?? []) {
    const object = fromRuntimeObjectRow(objectRow);
    if (object !== null) objects.push(object);
  }
  return objects;
}

/**
 * Placement requires every cell of an object's footprint to be claimed, so a game's objects can only
 * live in chunks that contain one of its claimed cells. That makes the claim rows the owner index the
 * spatial chunk store does not have.
 */
async function claimedChunkKeys(
  ctx: QueryCtx,
  gameId: Id<"games">,
): Promise<string[]> {
  return ownedClaimChunkKeys(ctx, gameId);
}

async function readChunkObjects(
  ctx: QueryCtx,
  serverId: Id<"jgGameServers">,
  chunkKeys: readonly string[],
): Promise<PlacedObject[]> {
  const objects: PlacedObject[] = [];
  for (const chunkKey of chunkKeys) {
    const row = await ctx.db
      .query("jgWorldChunks")
      .withIndex("by_server_and_chunk", (q) => q.eq("serverId", serverId).eq("chunkKey", chunkKey))
      .unique();
    if (row === null) continue;
    objects.push(...objectsFromChunkRow(row.snapshot as RuntimeChunkRow));
  }
  return objects;
}

export async function placedObjectsInChunks(
  ctx: QueryCtx,
  chunkKeys: readonly string[],
): Promise<PlacedObject[]> {
  if (chunkKeys.length === 0) return [];
  const server = await worldServerRow(ctx);
  if (server === null) return [];
  return readChunkObjects(ctx, server._id, chunkKeys);
}

export async function placedObjectsNear(
  ctx: QueryCtx,
  center: WorldPoint,
  radius: number,
): Promise<PlacedObject[]> {
  return placedObjectsInChunks(ctx, worldChunkKeysInRadius(center, radius));
}

export async function gameObjects(
  ctx: QueryCtx,
  game: Pick<Doc<"games">, "_id" | "createdBy">,
): Promise<PlacedObject[]> {
  const objects = await placedObjectsInChunks(ctx, await claimedChunkKeys(ctx, game._id));
  return objects.filter((object) => object.ownerUserId === game.createdBy);
}

export async function gameRacks(
  ctx: QueryCtx,
  game: Pick<Doc<"games">, "_id" | "createdBy">,
): Promise<PlacedRackObject[]> {
  return selectRacks(await gameObjects(ctx, game));
}

export async function gameRacksById(
  ctx: QueryCtx,
  gameId: Id<"games">,
): Promise<PlacedRackObject[]> {
  const game = await ctx.db.get(gameId);
  return game === null ? [] : gameRacks(ctx, game);
}

export async function deleteGameObjects(
  ctx: MutationCtx,
  gameId: Id<"games">,
  ownerUserId: string,
): Promise<number> {
  const server = await worldServerRow(ctx);
  if (server === null) return 0;
  const chunkKeys = await claimedChunkKeys(ctx, gameId);
  if (chunkKeys.length === 0) return 0;
  const loaded = await helpers.loadSnapshot(ctx, server._id, { players: [], chunkKeys });
  if (loaded === null) return 0;
  let snapshot = loaded.snapshot;
  let removed = 0;
  for (const chunkKey of chunkKeys) {
    for (const object of objectsFromChunkRow(snapshot.chunks[chunkKey])) {
      if (object.ownerUserId !== ownerUserId) continue;
      snapshot = removePlacedObject(snapshot, object.instanceId);
      removed += 1;
    }
  }
  if (removed === 0) return 0;
  await helpers.persistSnapshot(ctx, loaded.server, snapshot);
  return removed;
}
