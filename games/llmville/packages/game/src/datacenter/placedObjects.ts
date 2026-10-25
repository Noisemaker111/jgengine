import {
  setChunk,
  updateChunk,
  createEmptyChunkRow,
} from "@jgengine/core/runtime/worldChunks";
import type {
  GameRuntimeSnapshot,
  RuntimeChunkRow,
  RuntimeObjectRow,
} from "@jgengine/core/runtime/snapshot";
import type { InventoryState } from "@jgengine/core/inventory/inventoryModel";
import {
  isBuildItemId,
  isInfrastructureBuildItem,
  type BuildItemId,
  type InfrastructureBuildItemId,
  type PlaceableBuildItemId,
} from "@llmville/game/build/catalog";
import {
  assignmentKey,
  getRackSlotCapacity,
  inventoryToRackSlots,
  normalizeRackInstalledHardwareSlots,
  rackSlotsToInventory,
  RACK_STATE_VALUES,
  type ComputeAssignmentMap,
  type RackInstalledHardwareSlot,
  type RackSnapshot,
} from "@llmville/game/infrastructure/infrastructure";
import { isRackCoolingUnitId, type RackCoolingUnitId } from "@llmville/game/infrastructure/catalog";
import {
  normalizeRackSlotAssignments,
  type RackSlotAssignments,
} from "@llmville/game/infrastructure/rackAssignments";
import { cardinalToRotationY, rotationYToCardinal, type CardinalDirection } from "@llmville/game/world/cardinal";
import { worldChunkKeyAt, worldChunkKeysInRadius } from "@llmville/game/datacenter/worldChunks";

export type RackState = (typeof RACK_STATE_VALUES)[number];

export interface PlacedObjectPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * `ownerUserId` is the external user id — the same identifier as the command actor and
 * `jgPlayerProfiles.userId`. It is the only authoritative owner key; there is no game-row id here.
 */
interface PlacedObjectBase {
  instanceId: string;
  ownerUserId: string;
  position: PlacedObjectPosition;
  rotationY: number;
  direction: CardinalDirection;
  placedAt: number;
}

export interface PlacedRackObject extends PlacedObjectBase {
  kind: "rack";
  rackType: InfrastructureBuildItemId;
  state: RackState;
  installedCoolerId: RackCoolingUnitId | null;
  installedHardwareModuleIds: RackInstalledHardwareSlot[];
  assignments: RackSlotAssignments;
}

export interface PlacedDecorObject extends PlacedObjectBase {
  kind: "decor";
  itemId: PlaceableBuildItemId;
}

export type PlacedObject = PlacedRackObject | PlacedDecorObject;

const FLAG = {
  owner: "owner",
  placedAt: "placedAt",
  state: "state",
  cooler: "cooler",
  assignments: "assignments",
} as const;

const INSTANCE_ID_PREFIX = "obj_";
const INSTANCE_COORDINATE_SCALE = 1000;

function coordinateToken(value: number): string {
  return String(Math.round(value * INSTANCE_COORDINATE_SCALE) / INSTANCE_COORDINATE_SCALE);
}

/**
 * Deterministic, clock-free id derived from the footprint the object occupies. Placement forbids two
 * objects sharing a footprint, so the position alone is unique among live objects.
 */
export function placedObjectInstanceId(position: PlacedObjectPosition): string {
  return `${INSTANCE_ID_PREFIX}${coordinateToken(position.x)}_${coordinateToken(position.y)}_${coordinateToken(position.z)}`;
}

export function parsePlacedObjectInstanceId(instanceId: string): PlacedObjectPosition | null {
  if (!instanceId.startsWith(INSTANCE_ID_PREFIX)) return null;
  const tokens = instanceId.slice(INSTANCE_ID_PREFIX.length).split("_");
  if (tokens.length !== 3 || tokens.some((token) => token.length === 0)) return null;
  const [x, y, z] = tokens.map(Number) as [number, number, number];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

export function placedObjectChunkKey(instanceId: string): string | null {
  const position = parsePlacedObjectInstanceId(instanceId);
  return position === null ? null : worldChunkKeyAt(position);
}

export function placedObjectChunkKeys(instanceId: string): string[] {
  const position = parsePlacedObjectInstanceId(instanceId);
  return position === null ? [] : worldChunkKeysInRadius(position, 0.5 / INSTANCE_COORDINATE_SCALE);
}

function parseRackState(value: unknown): RackState {
  return (RACK_STATE_VALUES as readonly string[]).includes(value as string)
    ? (value as RackState)
    : "idle";
}

function parseCoolerId(value: unknown): RackCoolingUnitId | null {
  return typeof value === "string" && isRackCoolingUnitId(value) ? value : null;
}

export function toRuntimeObjectRow(object: PlacedObject): RuntimeObjectRow {
  const base = {
    instanceId: object.instanceId,
    position: [object.position.x, object.position.y, object.position.z] as [number, number, number],
    rotationY: object.rotationY,
  };
  if (object.kind === "decor") {
    return {
      ...base,
      catalogId: object.itemId,
      flags: { [FLAG.owner]: object.ownerUserId, [FLAG.placedAt]: object.placedAt },
    };
  }
  return {
    ...base,
    catalogId: object.rackType,
    flags: {
      [FLAG.owner]: object.ownerUserId,
      [FLAG.placedAt]: object.placedAt,
      [FLAG.state]: object.state,
      [FLAG.cooler]: object.installedCoolerId,
      [FLAG.assignments]: object.assignments,
    },
    slots: rackSlotsToInventory(
      normalizeRackInstalledHardwareSlots(object.installedHardwareModuleIds, object.rackType),
    ),
  };
}

function rackSlotsFromInventory(
  slots: InventoryState | undefined,
  rackType: string,
): RackInstalledHardwareSlot[] {
  const capacity = getRackSlotCapacity(rackType);
  const installed = slots === undefined ? [] : inventoryToRackSlots(slots);
  return normalizeRackInstalledHardwareSlots(
    Array.from({ length: capacity }, (_, index) => installed[index] ?? null),
    rackType,
  );
}

export function fromRuntimeObjectRow(row: RuntimeObjectRow): PlacedObject | null {
  if (!isBuildItemId(row.catalogId)) return null;
  const flags = row.flags ?? {};
  const ownerUserId = typeof flags[FLAG.owner] === "string" ? (flags[FLAG.owner] as string) : "";
  const placedAt = typeof flags[FLAG.placedAt] === "number" ? (flags[FLAG.placedAt] as number) : 0;
  const rotationY = row.rotationY ?? 0;
  const base: PlacedObjectBase = {
    instanceId: row.instanceId,
    ownerUserId,
    position: { x: row.position[0], y: row.position[1], z: row.position[2] },
    rotationY,
    direction: rotationYToCardinal(rotationY),
    placedAt,
  };
  const catalogId: BuildItemId = row.catalogId;
  if (!isInfrastructureBuildItem(catalogId)) {
    return { ...base, kind: "decor", itemId: catalogId };
  }
  return {
    ...base,
    kind: "rack",
    rackType: catalogId,
    state: parseRackState(flags[FLAG.state]),
    installedCoolerId: parseCoolerId(flags[FLAG.cooler]),
    installedHardwareModuleIds: rackSlotsFromInventory(row.slots, catalogId),
    assignments: normalizeRackSlotAssignments(flags[FLAG.assignments], catalogId),
  };
}

export function createPlacedRackObject(args: {
  rackType: InfrastructureBuildItemId;
  position: PlacedObjectPosition;
  direction: CardinalDirection;
  ownerUserId: string;
  placedAt: number;
}): PlacedRackObject {
  return {
    kind: "rack",
    instanceId: placedObjectInstanceId(args.position),
    ownerUserId: args.ownerUserId,
    position: args.position,
    rotationY: cardinalToRotationY(args.direction),
    direction: args.direction,
    placedAt: args.placedAt,
    rackType: args.rackType,
    state: "idle",
    installedCoolerId: null,
    installedHardwareModuleIds: Array.from(
      { length: getRackSlotCapacity(args.rackType) },
      () => null,
    ),
    assignments: normalizeRackSlotAssignments([], args.rackType),
  };
}

export function createPlacedDecorObject(args: {
  itemId: PlaceableBuildItemId;
  position: PlacedObjectPosition;
  direction: CardinalDirection;
  ownerUserId: string;
  placedAt: number;
}): PlacedDecorObject {
  return {
    kind: "decor",
    instanceId: placedObjectInstanceId(args.position),
    ownerUserId: args.ownerUserId,
    position: args.position,
    rotationY: cardinalToRotationY(args.direction),
    direction: args.direction,
    placedAt: args.placedAt,
    itemId: args.itemId,
  };
}

export function placedRackSnapshots(racks: readonly PlacedRackObject[]): RackSnapshot[] {
  return racks.map((rack) => ({
    rackId: rack.instanceId,
    rackType: rack.rackType,
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
    installedCoolerId: rack.installedCoolerId,
  }));
}

/**
 * A serving assignment whose `targetModelId` is no longer a live model reads as unassigned: the stored
 * slot keeps the dead id, but no lane, stat, or UI ever sees it. Deleting a model therefore cannot leave
 * a rack slot pointing at nothing, whatever path deleted it.
 */
export function placedRackAssignmentMap(
  racks: readonly PlacedRackObject[],
  liveModelIds: ReadonlySet<string>,
): ComputeAssignmentMap {
  const map: ComputeAssignmentMap = {};
  for (const rack of racks) {
    rack.assignments.forEach((assignment, slotIndex) => {
      if (assignment === null) return;
      if (assignment.lane === "serving") {
        const targetModelId = assignment.targetModelId;
        if (targetModelId === undefined || !liveModelIds.has(targetModelId)) return;
      }
      map[assignmentKey(rack.instanceId, slotIndex)] = assignment;
    });
  }
  return map;
}

export function listPlacedObjects(snapshot: GameRuntimeSnapshot): PlacedObject[] {
  const objects: PlacedObject[] = [];
  for (const chunk of Object.values(snapshot.chunks)) {
    for (const row of chunk.objects) {
      const object = fromRuntimeObjectRow(row);
      if (object !== null) objects.push(object);
    }
  }
  return objects;
}

export function findPlacedObject(
  snapshot: GameRuntimeSnapshot,
  instanceId: string,
): { chunkKey: string; object: PlacedObject } | null {
  for (const [chunkKey, chunk] of Object.entries(snapshot.chunks)) {
    for (const row of chunk.objects) {
      if (row.instanceId !== instanceId) continue;
      const object = fromRuntimeObjectRow(row);
      if (object !== null) return { chunkKey, object };
    }
  }
  return null;
}

export function insertPlacedObject(
  snapshot: GameRuntimeSnapshot,
  object: PlacedObject,
): GameRuntimeSnapshot {
  const chunkKey = worldChunkKeyAt(object.position);
  const existing: RuntimeChunkRow = snapshot.chunks[chunkKey] ?? createEmptyChunkRow(chunkKey);
  return setChunk(snapshot, chunkKey, {
    ...existing,
    objects: [
      ...existing.objects.filter((row) => row.instanceId !== object.instanceId),
      toRuntimeObjectRow(object),
    ],
  });
}

export function writePlacedObject(
  snapshot: GameRuntimeSnapshot,
  chunkKey: string,
  object: PlacedObject,
): GameRuntimeSnapshot {
  return updateChunk(snapshot, chunkKey, (chunk) => ({
    ...chunk,
    objects: chunk.objects.map((row) =>
      row.instanceId === object.instanceId ? toRuntimeObjectRow(object) : row,
    ),
  }));
}

export function removePlacedObject(
  snapshot: GameRuntimeSnapshot,
  instanceId: string,
): GameRuntimeSnapshot {
  const found = findPlacedObject(snapshot, instanceId);
  if (found === null) return snapshot;
  return updateChunk(snapshot, found.chunkKey, (chunk) => ({
    ...chunk,
    objects: chunk.objects.filter((row) => row.instanceId !== instanceId),
  }));
}
