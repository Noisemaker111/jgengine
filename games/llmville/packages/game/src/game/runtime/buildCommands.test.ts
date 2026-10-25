import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  PICKUP_BUILD_ITEM_COMMAND,
  PLACE_BUILD_ITEM_COMMAND,
  pickupBuildItemCommand,
  placeBuildItemCommand,
} from "@llmville/game/game/runtime/buildCommands";
import { createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";
import {
  findPlacedObject,
  listPlacedObjects,
  placedObjectInstanceId,
  writePlacedObject,
} from "@llmville/game/datacenter/placedObjects";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import { readSnapshotStock, STOCK_ID } from "@llmville/game/inventory/stock";
import { CARDINAL } from "@llmville/game/world/cardinal";

const ACTOR = "user_1";
const RACK_POSITION = { x: 10.5, y: 0, z: 10.5 };
const CLAIMED = ["9,9", "9,10", "9,11", "10,9", "10,10", "10,11", "11,9", "11,10", "11,11", "20,20"];

function snapshot(build: Record<string, number>): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: {
      [ACTOR]: {
        userId: ACTOR,
        inventories: {
          [STOCK_ID.build]: Object.entries(build).map(([item, count]) => ({ item, count })),
        },
        economy: { money: 10000 },
        territoryOwnedCount: CLAIMED.length,
        ownedTerritoryChunkKeys: ["0,0"],
        unlocks: [],
      },
    },
    chunks: { "0,0": { chunkKey: "0,0", objects: [], entities: [], territory: Object.fromEntries(CLAIMED.map(key => [key, ACTOR])) } },
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
}

function placeInput(overrides: Record<string, unknown> = {}) {
  return {
    itemId: "starter_rack",
    position: RACK_POSITION,
    direction: CARDINAL.N,
    claimedCellKeys: CLAIMED,
    now: 1_700_000_000_000,
    ...overrides,
  };
}

describe("placeBuildItem validate", () => {
  test("rejects malformed input", () => {
    for (const input of [
      null,
      "nope",
      placeInput({ itemId: 4 }),
      placeInput({ position: { x: 1, z: 2 } }),
      placeInput({ direction: 9 }),
      placeInput({ now: Number.NaN }),
    ]) {
      expect(placeBuildItemCommand.validate(snapshot({ starter_rack: 1 }), input, ACTOR)).toEqual({
        reason: "Malformed command input",
      });
    }
  });

  test("rejects an unknown actor", () => {
    expect(placeBuildItemCommand.validate(snapshot({ starter_rack: 1 }), placeInput(), "ghost")).toEqual({
      reason: "Unknown player",
    });
  });

  test("rejects an unknown item and empty stock", () => {
    expect(
      placeBuildItemCommand.validate(snapshot({ starter_rack: 1 }), placeInput({ itemId: "moon" }), ACTOR),
    ).toEqual({ reason: "Unknown build item" });
    expect(placeBuildItemCommand.validate(snapshot({}), placeInput(), ACTOR)).toEqual({
      reason: "Out of stock",
    });

  });

  test("accepts a legal placement", () => {
    expect(placeBuildItemCommand.validate(snapshot({ starter_rack: 1 }), placeInput(), ACTOR)).toBeNull();
  });

  test("rejects a second placement on the same footprint", () => {
    const placed = placeBuildItemCommand.apply(snapshot({ starter_rack: 2 }), placeInput(), ACTOR);
    expect(placeBuildItemCommand.validate(placed, placeInput(), ACTOR)).not.toBeNull();
  });
});

describe("placeBuildItem apply", () => {
  test("writes the rack into its chunk and decrements build stock", () => {
    const next = placeBuildItemCommand.apply(snapshot({ starter_rack: 2 }), placeInput(), ACTOR);
    const chunkKey = worldChunkKeyAt(RACK_POSITION);
    expect(next.dirty.chunks).toEqual([chunkKey]);
    expect(next.dirty.players).toEqual([ACTOR]);
    expect(readSnapshotStock(next, ACTOR, STOCK_ID.build)).toEqual({ starter_rack: 1 });

    const object = findPlacedObject(next, placedObjectInstanceId(RACK_POSITION))?.object;
    expect(object?.kind).toBe("rack");
    expect(object?.ownerUserId).toBe(ACTOR);
    expect(object?.placedAt).toBe(1_700_000_000_000);
  });

  test("writes decor with its own catalog id", () => {
    const next = placeBuildItemCommand.apply(
      snapshot({ neon_sign: 1 }),
      placeInput({ itemId: "neon_sign", position: { x: 20.5, y: 0, z: 20.5 } }),
      ACTOR,
    );
    const placed = listPlacedObjects(next);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: "decor", itemId: "neon_sign" });
    expect(readSnapshotStock(next, ACTOR, STOCK_ID.build)).toEqual({});
  });

  test("is a no-op for an invalid placement", () => {
    const start = snapshot({ starter_rack: 1 });
    start.chunks["0,0"]!.territory = { "10,10": "another-owner" };
    expect(placeBuildItemCommand.apply(start, placeInput(), ACTOR)).toBe(start);
  });
});

describe("pickupBuildItem", () => {
  function withRackPlaced(): GameRuntimeSnapshot {
    return placeBuildItemCommand.apply(snapshot({ starter_rack: 1 }), placeInput(), ACTOR);
  }

  test("rejects malformed input and unknown actors", () => {
    expect(pickupBuildItemCommand.validate(withRackPlaced(), { itemId: "starter_rack" }, ACTOR)).toEqual({
      reason: "Malformed command input",
    });
    expect(
      pickupBuildItemCommand.validate(
        withRackPlaced(),
        { itemId: "starter_rack", player: { x: 10, z: 10 } },
        "ghost",
      ),
    ).toEqual({ reason: "Unknown player" });
  });

  test("rejects when nothing of that item is placed", () => {
    expect(
      pickupBuildItemCommand.validate(
        withRackPlaced(),
        { itemId: "neon_sign", player: { x: 10, z: 10 } },
        ACTOR,
      ),
    ).toEqual({ reason: "Nothing placed to pick up" });
  });

  test("removes the object and returns it to build stock", () => {
    const start = withRackPlaced();
    const input = { itemId: "starter_rack", player: { x: 10, z: 10 } };
    expect(pickupBuildItemCommand.validate(start, input, ACTOR)).toBeNull();

    const next = pickupBuildItemCommand.apply(start, input, ACTOR);
    expect(listPlacedObjects(next)).toEqual([]);
    expect(readSnapshotStock(next, ACTOR, STOCK_ID.build)).toEqual({ starter_rack: 1 });
    expect(next.dirty.chunks).toContain(worldChunkKeyAt(RACK_POSITION));
    expect(next.dirty.players).toContain(ACTOR);
  });

  test("does not pick up another player's rack", () => {
    const start = withRackPlaced();
    const other: GameRuntimeSnapshot = {
      ...start,
      players: {
        ...start.players,
        user_2: { userId: "user_2", inventories: {}, economy: {}, unlocks: [] },
      },
    };
    expect(
      pickupBuildItemCommand.validate(other, { itemId: "starter_rack", player: { x: 10, z: 10 } }, "user_2"),
    ).toEqual({ reason: "Nothing placed to pick up" });
  });
});

describe("runtime command round trip", () => {
  test("place through runCommand marks the chunk and the actor dirty", () => {
    const runtime = createLlmvilleRuntime();
    const result = runtime.runCommand(snapshot({ starter_rack: 1 }), ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.dirty.chunks).toContain(worldChunkKeyAt(RACK_POSITION));
    expect(result.snapshot.dirty.players).toContain(ACTOR);
    expect(result.snapshot.dirty.server).toBe(true);
    expect(result.snapshot.revision).toBe(1);

    const pickup = runtime.runCommand(result.snapshot, ACTOR, PICKUP_BUILD_ITEM_COMMAND, {
      itemId: "starter_rack",
      player: { x: 10, z: 10 },
    });
    expect(pickup.ok).toBe(true);
    if (!pickup.ok) return;
    expect(listPlacedObjects(pickup.snapshot)).toEqual([]);
  });

  test("a rejected command surfaces its reason and leaves no snapshot", () => {
    const runtime = createLlmvilleRuntime();
    const result = runtime.runCommand(snapshot({}), ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput());
    expect(result).toEqual({ ok: false, reason: "Out of stock" });
  });
});

test("placement purchases unclaimed footprint atomically and ignores client ownership claims", () => {
  const before = snapshot({ starter_rack: 1 });
  before.chunks = {};
  before.players[ACTOR]!.territoryOwnedCount = 0;
  const result = createLlmvilleRuntime().runCommand(before, ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput({ claimedCellKeys: [] }));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.snapshot.players[ACTOR]!.economy.money).toBeLessThan(10000);
  expect(result.snapshot.players[ACTOR]!.territoryOwnedCount).toBeGreaterThan(0);
  expect(before.players[ACTOR]!.economy.money).toBe(10000);
  const blocked = snapshot({ starter_rack: 1 });
  blocked.chunks["0,0"]!.territory = { "10,10": "another-owner" };
  const rejected = createLlmvilleRuntime().runCommand(blocked, ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput());
  expect(rejected.ok).toBe(false);
  expect(blocked.players[ACTOR]!.economy.money).toBe(10000);
});

test("purchased items establish and grow a plot, and an equipped rack can be packed and relocated", () => {
  const runtime = createLlmvilleRuntime();
  const before = snapshot({ starter_rack: 2 });
  before.chunks = {};
  before.players[ACTOR]!.territoryOwnedCount = 0;
  before.players[ACTOR]!.ownedTerritoryChunkKeys = [];
  const first = runtime.runCommand(before, ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput());
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error(first.reason);
  const firstCount = Number(first.snapshot.players[ACTOR]!.territoryOwnedCount);
  expect(firstCount).toBeGreaterThan(0);
  const second = runtime.runCommand(first.snapshot, ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput({ position: { x: 13.5, y: 0, z: 10.5 } }));
  expect(second.ok).toBe(true);
  if (!second.ok) throw new Error(second.reason);
  expect(Number(second.snapshot.players[ACTOR]!.territoryOwnedCount)).toBeGreaterThan(firstCount);
  const found = findPlacedObject(second.snapshot, placedObjectInstanceId(RACK_POSITION));
  const rack = found?.object;
  if (rack?.kind !== "rack") throw new Error("Rack missing");
  const equipped = writePlacedObject(second.snapshot, found!.chunkKey, { ...rack, installedHardwareModuleIds: ["gpu_1", "gpu_1"], installedCoolerId: "basic_rack_fan" });
  const pickup = runtime.runCommand(equipped, ACTOR, PICKUP_BUILD_ITEM_COMMAND, { itemId: "starter_rack", player: RACK_POSITION });
  expect(pickup.ok).toBe(true);
  if (!pickup.ok) throw new Error(pickup.reason);
  expect(readSnapshotStock(pickup.snapshot, ACTOR, STOCK_ID.build).starter_rack).toBe(1);
  expect(readSnapshotStock(pickup.snapshot, ACTOR, STOCK_ID.hardware).gpu_1).toBe(2);
  expect(readSnapshotStock(pickup.snapshot, ACTOR, STOCK_ID.cooling).basic_rack_fan).toBe(1);
  const moved = runtime.runCommand(pickup.snapshot, ACTOR, PLACE_BUILD_ITEM_COMMAND, placeInput({ position: { x: 100.5, y: 0, z: 100.5 } }));
  expect(moved.ok).toBe(true);
  if (!moved.ok) throw new Error(moved.reason);
  expect(findPlacedObject(moved.snapshot, placedObjectInstanceId(RACK_POSITION))).toBeNull();
  expect(listPlacedObjects(moved.snapshot)).toHaveLength(2);
  expect(readSnapshotStock(moved.snapshot, ACTOR, STOCK_ID.hardware).gpu_1).toBe(2);
});
