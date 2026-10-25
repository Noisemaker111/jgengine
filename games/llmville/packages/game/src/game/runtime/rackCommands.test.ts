import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import { createPlacedRackObject, findPlacedObject, insertPlacedObject } from "@llmville/game/datacenter/placedObjects";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import { createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";
import {
  ASSIGN_RACK_CARD_COMMAND,
  MOVE_RACK_HARDWARE_COMMAND,
  assignRackCardCommand,
  installRackCoolerCommand,
  moveRackHardwareCommand,
  unassignRackCardCommand,
  uninstallRackCoolerCommand,
} from "@llmville/game/game/runtime/rackCommands";
import { readSnapshotStock, STOCK_ID } from "@llmville/game/inventory/stock";
import { CARDINAL } from "@llmville/game/world/cardinal";

const ACTOR = "user_1";
const RACK_POSITION = { x: 10.5, y: 0, z: 10.5 };
const RACK = createPlacedRackObject({
  rackType: "air_rack_4",
  position: RACK_POSITION,
  direction: CARDINAL.N,
  ownerUserId: ACTOR,
  placedAt: 1,
});
const RACK_ID = RACK.instanceId;
const CHUNK_KEY = worldChunkKeyAt(RACK_POSITION);

function snapshot(args: {
  hardware?: Record<string, number>;
  cooling?: Record<string, number>;
  rack?: Parameters<typeof insertPlacedObject>[1];
  extraPlayers?: string[];
}): GameRuntimeSnapshot {
  const players: GameRuntimeSnapshot["players"] = {
    [ACTOR]: {
      userId: ACTOR,
      inventories: {
        [STOCK_ID.hardware]: Object.entries(args.hardware ?? {}).map(([item, count]) => ({ item, count })),
        [STOCK_ID.cooling]: Object.entries(args.cooling ?? {}).map(([item, count]) => ({ item, count })),
      },
      economy: {},
      unlocks: [],
    },
  };
  for (const userId of args.extraPlayers ?? []) {
    players[userId] = { userId, inventories: {}, economy: {}, unlocks: [] };
  }
  const base: GameRuntimeSnapshot = {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players,
    chunks: {},
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
  const withRack = insertPlacedObject(base, args.rack ?? RACK);
  return { ...withRack, revision: 0, dirty: { server: false, players: [], chunks: [] } };
}

function rackIn(state: GameRuntimeSnapshot) {
  const found = findPlacedObject(state, RACK_ID);
  if (found === null || found.object.kind !== "rack") throw new Error("rack missing");
  return found.object;
}

describe("moveRackHardware command", () => {
  const input = { rackInstanceId: RACK_ID, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "slot" } };

  test("rejects malformed input", () => {
    const state = snapshot({ hardware: { gpu_1: 1 } });
    for (const bad of [
      null,
      { rackInstanceId: RACK_ID },
      { rackInstanceId: RACK_ID, from: { kind: "nope" }, to: { kind: "slot" } },
      { rackInstanceId: RACK_ID, from: { kind: "slot", slot: -1 }, to: { kind: "stock" } },
      { rackInstanceId: RACK_ID, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "void" } },
    ]) {
      expect(moveRackHardwareCommand.validate(state, bad, ACTOR)).toEqual({
        reason: "Malformed command input",
      });
    }
  });

  test("rejects an unknown rack, a foreign rack, and an unknown actor", () => {
    const state = snapshot({ hardware: { gpu_1: 1 }, extraPlayers: ["user_2"] });
    expect(moveRackHardwareCommand.validate(state, { ...input, rackInstanceId: "obj_0_0_0" }, ACTOR)).toEqual({
      reason: "Rack not found",
    });
    expect(moveRackHardwareCommand.validate(state, input, "user_2")).toEqual({ reason: "Not your rack" });
    expect(moveRackHardwareCommand.validate(state, input, "ghost")).toEqual({ reason: "Unknown player" });
  });

  test("rejects installing hardware that is not in stock", () => {
    expect(moveRackHardwareCommand.validate(snapshot({}), input, ACTOR)).toEqual({ reason: "no_stock" });
  });

  test("installs a card, decrements hardware stock, and marks both dirty", () => {
    const state = snapshot({ hardware: { gpu_1: 2 } });
    expect(moveRackHardwareCommand.validate(state, input, ACTOR)).toBeNull();

    const next = moveRackHardwareCommand.apply(state, input, ACTOR);
    expect(rackIn(next).installedHardwareModuleIds).toEqual(["gpu_1", null, null, null]);
    expect(readSnapshotStock(next, ACTOR, STOCK_ID.hardware).gpu_1).toBe(1);
    expect(next.dirty.chunks).toEqual([CHUNK_KEY]);
    expect(next.dirty.players).toEqual([ACTOR]);
  });

  test("uninstalling a card clears the assignment that pointed at its slot", () => {
    const installed = moveRackHardwareCommand.apply(snapshot({ hardware: { gpu_1: 1 } }), input, ACTOR);
    const assigned = assignRackCardCommand.apply(
      installed,
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "training" },
      ACTOR,
    );
    expect(rackIn(assigned).assignments[0]).toEqual({ lane: "training" });

    const removed = moveRackHardwareCommand.apply(
      assigned,
      { rackInstanceId: RACK_ID, from: { kind: "slot", slot: 0 }, to: { kind: "stock" } },
      ACTOR,
    );
    expect(rackIn(removed).installedHardwareModuleIds).toEqual([null, null, null, null]);
    expect(rackIn(removed).assignments).toEqual([null, null, null, null]);
    expect(readSnapshotStock(removed, ACTOR, STOCK_ID.hardware).gpu_1).toBe(1);
  });
});

describe("rack cooler commands", () => {
  const install = { rackInstanceId: RACK_ID, coolerId: "basic_rack_fan" };

  test("rejects malformed input and an incompatible cooler", () => {
    const state = snapshot({ cooling: { basic_rack_fan: 1, small_water_cooler: 1 } });
    expect(installRackCoolerCommand.validate(state, { rackInstanceId: RACK_ID }, ACTOR)).toEqual({
      reason: "Malformed command input",
    });
    expect(
      installRackCoolerCommand.validate(state, { ...install, coolerId: "small_water_cooler" }, ACTOR),
    ).toEqual({ reason: "incompatible" });
    expect(installRackCoolerCommand.validate(state, { ...install, coolerId: "ice_cube" }, ACTOR)).toEqual({
      reason: "unknown_cooler",
    });
  });

  test("rejects installing with no cooling stock", () => {
    expect(installRackCoolerCommand.validate(snapshot({}), install, ACTOR)).toEqual({ reason: "no_stock" });
  });

  test("installs then uninstalls, moving the cooler through stock", () => {
    const state = snapshot({ cooling: { basic_rack_fan: 1 } });
    const installed = installRackCoolerCommand.apply(state, install, ACTOR);
    expect(rackIn(installed).installedCoolerId).toBe("basic_rack_fan");
    expect(readSnapshotStock(installed, ACTOR, STOCK_ID.cooling)).toEqual({});
    expect(installed.dirty.chunks).toEqual([CHUNK_KEY]);
    expect(installed.dirty.players).toEqual([ACTOR]);

    expect(installRackCoolerCommand.validate(installed, install, ACTOR)).toEqual({
      reason: "already_installed",
    });

    const uninstalled = uninstallRackCoolerCommand.apply(installed, { rackInstanceId: RACK_ID }, ACTOR);
    expect(rackIn(uninstalled).installedCoolerId).toBeNull();
    expect(readSnapshotStock(uninstalled, ACTOR, STOCK_ID.cooling)).toEqual({ basic_rack_fan: 1 });
  });

  test("rejects uninstalling from a rack with no cooler", () => {
    expect(uninstallRackCoolerCommand.validate(snapshot({}), { rackInstanceId: RACK_ID }, ACTOR)).toEqual({
      reason: "no_cooler_installed",
    });
  });
});

describe("rack card assignment commands", () => {
  function withCard(): GameRuntimeSnapshot {
    return moveRackHardwareCommand.apply(
      snapshot({ hardware: { gpu_1: 1 } }),
      { rackInstanceId: RACK_ID, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "slot" } },
      ACTOR,
    );
  }

  test("rejects malformed input", () => {
    const state = withCard();
    for (const bad of [
      { rackInstanceId: RACK_ID, slotIndex: 0 },
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "mining" },
      { rackInstanceId: RACK_ID, slotIndex: -1, lane: "training" },
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "serving", targetModelId: 7 },
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "training", targetModelExists: "yes" },
    ]) {
      expect(assignRackCardCommand.validate(state, bad, ACTOR)).toEqual({
        reason: "Malformed command input",
      });
    }
  });

  test("rejects assigning an empty slot", () => {
    expect(
      assignRackCardCommand.validate(withCard(), { rackInstanceId: RACK_ID, slotIndex: 3, lane: "training" }, ACTOR),
    ).toEqual({ reason: "No GPU in that slot" });
  });

  test("assigns and unassigns the slot, marking the chunk dirty", () => {
    const state = withCard();
    const assigned = assignRackCardCommand.apply(
      state,
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "scraping" },
      ACTOR,
    );
    expect(rackIn(assigned).assignments).toEqual([{ lane: "scraping" }, null, null, null]);
    expect(assigned.dirty.chunks).toContain(CHUNK_KEY);

    const cleared = unassignRackCardCommand.apply(assigned, { rackInstanceId: RACK_ID, slotIndex: 0 }, ACTOR);
    expect(rackIn(cleared).assignments).toEqual([null, null, null, null]);
  });

  test("serving needs a model that exists", () => {
    const state = withCard();
    expect(
      assignRackCardCommand.validate(
        state,
        { rackInstanceId: RACK_ID, slotIndex: 0, lane: "serving", targetModelId: "m", targetModelExists: false },
        ACTOR,
      ),
    ).toEqual({ reason: "Model not found" });
    const assigned = assignRackCardCommand.apply(
      state,
      { rackInstanceId: RACK_ID, slotIndex: 0, lane: "serving", targetModelId: "m", targetModelExists: true },
      ACTOR,
    );
    expect(rackIn(assigned).assignments[0]).toEqual({ lane: "serving", targetModelId: "m" });
  });
});

describe("rack commands through the runtime", () => {
  test("registered commands run and mark the chunk and actor dirty", () => {
    const runtime = createLlmvilleRuntime();
    const moved = runtime.runCommand(snapshot({ hardware: { gpu_1: 1 } }), ACTOR, MOVE_RACK_HARDWARE_COMMAND, {
      rackInstanceId: RACK_ID,
      from: { kind: "stock", hardwareId: "gpu_1" },
      to: { kind: "slot" },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.snapshot.dirty.chunks).toContain(CHUNK_KEY);
    expect(moved.snapshot.dirty.players).toContain(ACTOR);
    expect(moved.snapshot.revision).toBe(1);

    const assigned = runtime.runCommand(moved.snapshot, ACTOR, ASSIGN_RACK_CARD_COMMAND, {
      rackInstanceId: RACK_ID,
      slotIndex: 0,
      lane: "training",
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(rackIn(assigned.snapshot).assignments[0]).toEqual({ lane: "training" });
  });

  test("an unknown command name is rejected", () => {
    const runtime = createLlmvilleRuntime();
    expect(runtime.runCommand(snapshot({}), ACTOR, "notACommand", {}).ok).toBe(false);
  });
});
