import type { CommandDef, CommandScope } from "@jgengine/core/runtime/commandRunner";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  findPlacedObject,
  placedObjectChunkKeys,
  writePlacedObject,
  type PlacedRackObject,
} from "@llmville/game/datacenter/placedObjects";
import {
  isRecord,
  readNonNegativeInteger,
  readString,
} from "@llmville/game/game/runtime/commandInput";
import {
  normalizeRackCoolingInventory,
  type RackCoolingInventory,
} from "@llmville/game/infrastructure/catalog";
import {
  installCoolerIntoRack,
  moveRackHardware,
  normalizeHardwareInventory,
  uninstallCoolerFromRack,
  type ComputeLane,
  type RackHardwareSource,
  type RackHardwareTarget,
} from "@llmville/game/infrastructure/infrastructure";
import {
  decideRackSlotAssignment,
  isComputeLane,
  withRackSlotAssignmentsFollowingHardware,
  withRackSlotUnassigned,
} from "@llmville/game/infrastructure/rackAssignments";
import { readSnapshotStock, writeSnapshotStock, STOCK_ID } from "@llmville/game/inventory/stock";

export const MOVE_RACK_HARDWARE_COMMAND = "moveRackHardware";
export const INSTALL_RACK_COOLER_COMMAND = "installRackCooler";
export const UNINSTALL_RACK_COOLER_COMMAND = "uninstallRackCooler";
export const ASSIGN_RACK_CARD_COMMAND = "assignRackCard";
export const UNASSIGN_RACK_CARD_COMMAND = "unassignRackCard";

const UNKNOWN_PLAYER = "Unknown player";
const MALFORMED_INPUT = "Malformed command input";
const UNKNOWN_RACK = "Rack not found";
const NOT_RACK_OWNER = "Not your rack";

interface RackTarget {
  chunkKey: string;
  rack: PlacedRackObject;
}

function findOwnedRack(
  snapshot: GameRuntimeSnapshot,
  instanceId: string,
  actorUserId: string,
): RackTarget | { reason: string } {
  const found = findPlacedObject(snapshot, instanceId);
  if (found === null || found.object.kind !== "rack") return { reason: UNKNOWN_RACK };
  if (found.object.ownerUserId !== actorUserId) return { reason: NOT_RACK_OWNER };
  return { chunkKey: found.chunkKey, rack: found.object };
}

function isRackTarget(value: RackTarget | { reason: string }): value is RackTarget {
  return "rack" in value;
}

function rackScope(input: unknown, actorUserId: string): CommandScope {
  const rackInstanceId = isRecord(input) ? readString(input.rackInstanceId) : null;
  return { players: [actorUserId], chunkKeys: rackInstanceId === null ? [] : placedObjectChunkKeys(rackInstanceId) };
}

export interface MoveRackHardwareCommandInput {
  rackInstanceId: string;
  from: RackHardwareSource;
  to: RackHardwareTarget;
}

function parseHardwareSource(value: unknown): RackHardwareSource | null {
  if (!isRecord(value)) return null;
  if (value.kind === "stock") {
    const hardwareId = readString(value.hardwareId);
    return hardwareId === null ? null : { kind: "stock", hardwareId };
  }
  if (value.kind === "slot") {
    const slot = readNonNegativeInteger(value.slot);
    return slot === null ? null : { kind: "slot", slot };
  }
  return null;
}

function parseHardwareTarget(value: unknown): RackHardwareTarget | null {
  if (!isRecord(value)) return null;
  if (value.kind === "stock") return { kind: "stock" };
  if (value.kind !== "slot") return null;
  if (value.slot === undefined) return { kind: "slot" };
  const slot = readNonNegativeInteger(value.slot);
  return slot === null ? null : { kind: "slot", slot };
}

function parseMoveHardwareInput(input: unknown): MoveRackHardwareCommandInput | null {
  if (!isRecord(input)) return null;
  const rackInstanceId = readString(input.rackInstanceId);
  const from = parseHardwareSource(input.from);
  const to = parseHardwareTarget(input.to);
  return rackInstanceId === null || from === null || to === null
    ? null
    : { rackInstanceId, from, to };
}

export const moveRackHardwareCommand: CommandDef = {
  scope: rackScope,
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseMoveHardwareInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return target;
    const outcome = moveRackHardware(
      {
        rackType: target.rack.rackType,
        installed: target.rack.installedHardwareModuleIds,
        stock: normalizeHardwareInventory(readSnapshotStock(snapshot, actorUserId, STOCK_ID.hardware)),
      },
      parsed.from,
      parsed.to,
    );
    return outcome.ok ? null : { reason: outcome.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseMoveHardwareInput(input);
    if (parsed === null) return snapshot;
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return snapshot;
    const outcome = moveRackHardware(
      {
        rackType: target.rack.rackType,
        installed: target.rack.installedHardwareModuleIds,
        stock: normalizeHardwareInventory(readSnapshotStock(snapshot, actorUserId, STOCK_ID.hardware)),
      },
      parsed.from,
      parsed.to,
    );
    if (!outcome.ok) return snapshot;
    const rack: PlacedRackObject = {
      ...target.rack,
      installedHardwareModuleIds: outcome.nextInstalled,
      assignments: withRackSlotAssignmentsFollowingHardware(
        target.rack.assignments,
        outcome.nextInstalled,
      ),
    };
    return writeSnapshotStock(
      writePlacedObject(snapshot, target.chunkKey, rack),
      actorUserId,
      STOCK_ID.hardware,
      outcome.nextStock,
    );
  },
};

export interface InstallRackCoolerCommandInput {
  rackInstanceId: string;
  coolerId: string;
}

function parseInstallCoolerInput(input: unknown): InstallRackCoolerCommandInput | null {
  if (!isRecord(input)) return null;
  const rackInstanceId = readString(input.rackInstanceId);
  const coolerId = readString(input.coolerId);
  return rackInstanceId === null || coolerId === null ? null : { rackInstanceId, coolerId };
}

function coolingStock(snapshot: GameRuntimeSnapshot, actorUserId: string): RackCoolingInventory {
  return normalizeRackCoolingInventory(readSnapshotStock(snapshot, actorUserId, STOCK_ID.cooling));
}

export const installRackCoolerCommand: CommandDef = {
  scope: rackScope,
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseInstallCoolerInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return target;
    const outcome = installCoolerIntoRack({
      rackType: target.rack.rackType,
      installedCoolerId: target.rack.installedCoolerId,
      coolingInventory: coolingStock(snapshot, actorUserId),
      coolerId: parsed.coolerId,
    });
    return outcome.ok ? null : { reason: outcome.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseInstallCoolerInput(input);
    if (parsed === null) return snapshot;
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return snapshot;
    const outcome = installCoolerIntoRack({
      rackType: target.rack.rackType,
      installedCoolerId: target.rack.installedCoolerId,
      coolingInventory: coolingStock(snapshot, actorUserId),
      coolerId: parsed.coolerId,
    });
    if (!outcome.ok) return snapshot;
    return writeSnapshotStock(
      writePlacedObject(snapshot, target.chunkKey, {
        ...target.rack,
        installedCoolerId: outcome.coolerId,
      }),
      actorUserId,
      STOCK_ID.cooling,
      outcome.nextInventory,
    );
  },
};

export interface UninstallRackCoolerCommandInput {
  rackInstanceId: string;
}

function parseRackOnlyInput(input: unknown): UninstallRackCoolerCommandInput | null {
  if (!isRecord(input)) return null;
  const rackInstanceId = readString(input.rackInstanceId);
  return rackInstanceId === null ? null : { rackInstanceId };
}

export const uninstallRackCoolerCommand: CommandDef = {
  scope: rackScope,
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseRackOnlyInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return target;
    const outcome = uninstallCoolerFromRack({
      installedCoolerId: target.rack.installedCoolerId,
      coolingInventory: coolingStock(snapshot, actorUserId),
    });
    return outcome.ok ? null : { reason: outcome.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseRackOnlyInput(input);
    if (parsed === null) return snapshot;
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return snapshot;
    const outcome = uninstallCoolerFromRack({
      installedCoolerId: target.rack.installedCoolerId,
      coolingInventory: coolingStock(snapshot, actorUserId),
    });
    if (!outcome.ok) return snapshot;
    return writeSnapshotStock(
      writePlacedObject(snapshot, target.chunkKey, { ...target.rack, installedCoolerId: null }),
      actorUserId,
      STOCK_ID.cooling,
      outcome.nextInventory,
    );
  },
};

export interface AssignRackCardCommandInput {
  rackInstanceId: string;
  slotIndex: number;
  lane: ComputeLane;
  targetModelId?: string;
  targetModelExists?: boolean;
}

function parseAssignInput(input: unknown): AssignRackCardCommandInput | null {
  if (!isRecord(input)) return null;
  const rackInstanceId = readString(input.rackInstanceId);
  const slotIndex = readNonNegativeInteger(input.slotIndex);
  if (rackInstanceId === null || slotIndex === null || !isComputeLane(input.lane)) return null;
  const targetModelId = input.targetModelId === undefined ? undefined : readString(input.targetModelId);
  if (targetModelId === null) return null;
  if (input.targetModelExists !== undefined && typeof input.targetModelExists !== "boolean") return null;
  return {
    rackInstanceId,
    slotIndex,
    lane: input.lane,
    targetModelId,
    targetModelExists: input.targetModelExists,
  };
}

function assignmentArgs(input: AssignRackCardCommandInput, rack: PlacedRackObject) {
  return {
    installedHardwareModuleIds: rack.installedHardwareModuleIds,
    assignments: rack.assignments,
    slotIndex: input.slotIndex,
    lane: input.lane,
    targetModelId: input.targetModelId,
    targetModelExists: input.targetModelExists,
  };
}

export const assignRackCardCommand: CommandDef = {
  scope: rackScope,
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseAssignInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return target;
    const decision = decideRackSlotAssignment(assignmentArgs(parsed, target.rack));
    return decision.ok ? null : { reason: decision.reason };
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseAssignInput(input);
    if (parsed === null) return snapshot;
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return snapshot;
    const decision = decideRackSlotAssignment(assignmentArgs(parsed, target.rack));
    if (!decision.ok) return snapshot;
    return writePlacedObject(snapshot, target.chunkKey, {
      ...target.rack,
      assignments: decision.assignments,
    });
  },
};

export interface UnassignRackCardCommandInput {
  rackInstanceId: string;
  slotIndex: number;
}

function parseUnassignInput(input: unknown): UnassignRackCardCommandInput | null {
  if (!isRecord(input)) return null;
  const rackInstanceId = readString(input.rackInstanceId);
  const slotIndex = readNonNegativeInteger(input.slotIndex);
  return rackInstanceId === null || slotIndex === null ? null : { rackInstanceId, slotIndex };
}

export const unassignRackCardCommand: CommandDef = {
  scope: rackScope,
  validate(snapshot, input, actorUserId) {
    if (snapshot.players[actorUserId] === undefined) return { reason: UNKNOWN_PLAYER };
    const parsed = parseUnassignInput(input);
    if (parsed === null) return { reason: MALFORMED_INPUT };
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    return isRackTarget(target) ? null : target;
  },
  apply(snapshot, input, actorUserId) {
    const parsed = parseUnassignInput(input);
    if (parsed === null) return snapshot;
    const target = findOwnedRack(snapshot, parsed.rackInstanceId, actorUserId);
    if (!isRackTarget(target)) return snapshot;
    return writePlacedObject(snapshot, target.chunkKey, {
      ...target.rack,
      assignments: withRackSlotUnassigned(target.rack.assignments, parsed.slotIndex),
    });
  },
};
