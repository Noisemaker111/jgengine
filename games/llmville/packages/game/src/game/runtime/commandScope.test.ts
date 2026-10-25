import { describe, expect, test } from "bun:test";

import {
  commandScopeEscape,
  resolveCommandScope,
  scopeWithActor,
  type CommandScope,
} from "@jgengine/core/runtime/commandRunner";
import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import { getPlacementBounds } from "@llmville/game/build/build";
import { cellKey, cellsForBounds } from "@llmville/game/datacenter/grid";
import {
  createPlacedRackObject,
  insertPlacedObject,
  parsePlacedObjectInstanceId,
  placedObjectChunkKey,
  placedObjectInstanceId,
} from "@llmville/game/datacenter/placedObjects";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import {
  PICKUP_BUILD_ITEM_COMMAND,
  PLACE_BUILD_ITEM_COMMAND,
  placeBuildItemCommand,
} from "@llmville/game/game/runtime/buildCommands";
import { createLlmvilleRuntime, llmvilleCommands } from "@llmville/game/game/runtime/definition";
import {
  ASSIGN_RACK_CARD_COMMAND,
  INSTALL_RACK_COOLER_COMMAND,
  MOVE_RACK_HARDWARE_COMMAND,
  UNASSIGN_RACK_CARD_COMMAND,
  UNINSTALL_RACK_COOLER_COMMAND,
} from "@llmville/game/game/runtime/rackCommands";
import { SET_SESSION_POSE_COMMAND } from "@llmville/game/game/runtime/session";
import { STOCK_ID } from "@llmville/game/inventory/stock";
import { CARDINAL } from "@llmville/game/world/cardinal";

const ACTOR = "user_1";
const NOW = 1_700_000_000_000;

const CLEAN: GameRuntimeSnapshot["dirty"] = { server: false, players: [], chunks: [] };

function baseSnapshot(stocks: Partial<Record<string, Record<string, number>>>): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: {
      [ACTOR]: {
        userId: ACTOR,
        inventories: Object.fromEntries(
          Object.entries(stocks).map(([stock, counts]) => [
            stock,
            Object.entries(counts ?? {}).map(([item, count]) => ({ item, count })),
          ]),
        ),
        economy: { money: 100000 },
        unlocks: [],
      },
    },
    chunks: {},
    revision: 0,
    dirty: CLEAN,
  };
}

function withRack(
  snapshot: GameRuntimeSnapshot,
  position: { x: number; y: number; z: number },
): GameRuntimeSnapshot {
  const next = insertPlacedObject(
    snapshot,
    createPlacedRackObject({
      rackType: "air_rack_4",
      position,
      direction: CARDINAL.N,
      ownerUserId: ACTOR,
      placedAt: 1,
    }),
  );
  return { ...next, revision: 0, dirty: CLEAN };
}

function claimsFor(itemId: string, position: { x: number; z: number }): string[] {
  return cellsForBounds(getPlacementBounds(itemId, position, CARDINAL.N)).map(cellKey);
}

function declaredScope(commandName: string, input: unknown): CommandScope | undefined {
  return scopeWithActor(resolveCommandScope(llmvilleCommands, commandName, input, ACTOR), ACTOR);
}

function runScoped(
  snapshot: GameRuntimeSnapshot,
  commandName: string,
  input: unknown,
): { snapshot: GameRuntimeSnapshot; scope: CommandScope | undefined } {
  const result = createLlmvilleRuntime().runCommand(snapshot, ACTOR, commandName, input);
  if (!result.ok) throw new Error(`${commandName} rejected: ${result.reason}`);
  const scope = declaredScope(commandName, input);
  expect(commandScopeEscape(scope, result.snapshot.dirty, commandName)).toBeNull();
  return { snapshot: result.snapshot, scope };
}

function hydrateOnly(
  snapshot: GameRuntimeSnapshot,
  chunkKeys: readonly string[] | undefined,
): GameRuntimeSnapshot {
  if (chunkKeys === undefined) return snapshot;
  return {
    ...snapshot,
    chunks: Object.fromEntries(
      Object.entries(snapshot.chunks).filter(([key]) => chunkKeys.includes(key)),
    ),
  };
}

describe("placed object instance ids round trip", () => {
  test("parses back the position the id was minted from", () => {
    for (const position of [
      { x: 10.5, y: 0, z: 10.5 },
      { x: -3.25, y: 1, z: 0 },
      { x: 64, y: 0, z: -128.125 },
    ]) {
      expect(parsePlacedObjectInstanceId(placedObjectInstanceId(position))).toEqual(position);
      expect(placedObjectChunkKey(placedObjectInstanceId(position))).toBe(worldChunkKeyAt(position));
    }
  });

  test("returns null for malformed ids instead of throwing", () => {
    for (const id of ["", "obj_", "obj_1_2", "obj_1_2_3_4", "obj___", "obj_a_b_c", "rack_1_2_3", "1_2_3"]) {
      expect(parsePlacedObjectInstanceId(id)).toBeNull();
      expect(placedObjectChunkKey(id)).toBeNull();
    }
  });
});

describe("setSessionPose scope", () => {
  test("touches only the actor and no chunk", () => {
    const { snapshot, scope } = runScoped(baseSnapshot({}), SET_SESSION_POSE_COMMAND, {
      x: 1,
      y: 0,
      z: 2,
      rotationY: 0.5,
    });
    expect(scope).toEqual({ players: [ACTOR], chunkKeys: [] });
    expect(snapshot.dirty.chunks).toEqual([]);
  });
});

describe("placeBuildItem scope", () => {
  const POSITION = { x: 10.5, y: 0, z: 10.5 };

  function placeInput(overrides: Record<string, unknown> = {}) {
    const itemId = (overrides.itemId as string) ?? "starter_rack";
    const position = (overrides.position as { x: number; y: number; z: number }) ?? POSITION;
    return {
      itemId,
      position,
      direction: CARDINAL.N,
      claimedCellKeys: claimsFor(itemId, position),
      now: NOW,
      ...overrides,
    };
  }

  test("covers the written chunk", () => {
    const input = placeInput();
    const { snapshot, scope } = runScoped(baseSnapshot({ [STOCK_ID.build]: { starter_rack: 1 } }), PLACE_BUILD_ITEM_COMMAND, input);
    expect(snapshot.dirty.chunks).toContain(worldChunkKeyAt(POSITION));
    for (const key of snapshot.dirty.chunks) expect(scope?.chunkKeys).toContain(key);
    expect(snapshot.players[ACTOR].territoryOwnedCount).toBeGreaterThan(0);
    expect(scope?.chunkKeys).toContain(worldChunkKeyAt(POSITION));
  });

  test("covers both chunks when the footprint straddles a chunk boundary", () => {
    const straddling = { x: 64, y: 0, z: 10.5 };
    const input = placeInput({ itemId: "beanbag_corner", position: straddling });
    const bounds = getPlacementBounds("beanbag_corner", straddling, CARDINAL.N);
    const nearEdge = worldChunkKeyAt({ x: bounds.minX, z: straddling.z });
    const farEdge = worldChunkKeyAt({ x: bounds.maxX, z: straddling.z });
    expect(nearEdge).not.toBe(farEdge);

    const { scope } = runScoped(
      baseSnapshot({ [STOCK_ID.build]: { beanbag_corner: 1 } }),
      PLACE_BUILD_ITEM_COMMAND,
      input,
    );
    expect(scope?.chunkKeys).toContain(nearEdge);
    expect(scope?.chunkKeys).toContain(farEdge);
  });

  test("first placement persists cross-boundary territory and its charge within the hydrated scope", () => {
    const position = { x: 64, y: 0, z: 10.5 };
    const input = placeInput({ itemId: "beanbag_corner", position });
    const scope = declaredScope(PLACE_BUILD_ITEM_COMMAND, input);
    const world = hydrateOnly(baseSnapshot({ [STOCK_ID.build]: { beanbag_corner: 1 } }), scope?.chunkKeys);
    const { snapshot } = runScoped(world, PLACE_BUILD_ITEM_COMMAND, input);
    expect(snapshot.players[ACTOR].economy.money).toBeLessThan(world.players[ACTOR].economy.money!);
    expect(snapshot.players[ACTOR].territoryOwnedCount).toBeGreaterThan(0);
    for (const chunkKey of ["0,0", "1,0"]) {
      expect(snapshot.dirty.chunks).toContain(chunkKey);
      expect(Object.values(snapshot.chunks[chunkKey]!.territory!)).toContain(ACTOR);
    }
    expect(commandScopeEscape({ players: [ACTOR], chunkKeys: [worldChunkKeyAt(position)] }, snapshot.dirty, PLACE_BUILD_ITEM_COMMAND)).toContain("0,0");
  });

  test("still rejects an overlap when the neighbour lives in an adjacent chunk", () => {
    const neighbour = { x: 63.8, y: 0, z: 10.5 };
    const overlapping = { x: 64.4, y: 0, z: 10.5 };
    expect(worldChunkKeyAt(neighbour)).not.toBe(worldChunkKeyAt(overlapping));

    const world = withRack(baseSnapshot({ [STOCK_ID.build]: { starter_rack: 1 } }), neighbour);
    const input = placeInput({
      position: overlapping,
      claimedCellKeys: [...claimsFor("starter_rack", neighbour), ...claimsFor("starter_rack", overlapping)],
    });

    const hydrated = hydrateOnly(world, declaredScope(PLACE_BUILD_ITEM_COMMAND, input)?.chunkKeys);
    expect(Object.keys(hydrated.chunks)).toContain(worldChunkKeyAt(neighbour));
    expect(placeBuildItemCommand.validate(hydrated, input, ACTOR)).toEqual({ reason: "Invalid placement" });
  });

  test("a scope narrowed to the written chunk alone would miss that overlap", () => {
    const neighbour = { x: 63.8, y: 0, z: 10.5 };
    const overlapping = { x: 64.4, y: 0, z: 10.5 };
    const world = withRack(baseSnapshot({ [STOCK_ID.build]: { starter_rack: 1 } }), neighbour);
    const input = placeInput({
      position: overlapping,
      claimedCellKeys: [...claimsFor("starter_rack", neighbour), ...claimsFor("starter_rack", overlapping)],
    });

    const tooNarrow = hydrateOnly(world, [worldChunkKeyAt(overlapping)]);
    expect(placeBuildItemCommand.validate(tooNarrow, input, ACTOR)).toBeNull();
  });
});

describe("pickupBuildItem scope", () => {
  test("hydrates all chunks for a nearby target", () => {
    const rack = { x: 10.5, y: 0, z: 10.5 };
    const world = withRack(baseSnapshot({ [STOCK_ID.build]: {} }), rack);
    const input = { itemId: "air_rack_4", player: { x: 10, z: 10 } };

    const { snapshot, scope } = runScoped(world, PICKUP_BUILD_ITEM_COMMAND, input);
    expect(scope).toEqual({ players: [ACTOR] });
    expect(snapshot.dirty.chunks).toEqual([worldChunkKeyAt(rack)]);
  });

  test("hydrates a target across the player's chunk boundary", () => {
    const rack = { x: 64.5, y: 0, z: 10.5 };
    const player = { x: 63.5, z: 10.5 };
    expect(worldChunkKeyAt(rack)).not.toBe(worldChunkKeyAt({ x: player.x, z: player.z }));

    const world = withRack(baseSnapshot({ [STOCK_ID.build]: {} }), rack);
    const input = { itemId: "air_rack_4", player };
    const scope = declaredScope(PICKUP_BUILD_ITEM_COMMAND, input);
    expect(scope).toEqual({ players: [ACTOR] });

    const hydrated = hydrateOnly(world, scope?.chunkKeys);
    const { snapshot } = runScoped(hydrated, PICKUP_BUILD_ITEM_COMMAND, input);
    expect(snapshot.dirty.chunks).toEqual([worldChunkKeyAt(rack)]);
  });

  test("preserves distant pickup with whole-world hydration", () => {
    const distant = { x: 640.5, y: 0, z: 10.5 };
    const world = withRack(baseSnapshot({ [STOCK_ID.build]: {} }), distant);
    const input = { itemId: "air_rack_4", player: { x: 10, z: 10 } };

    const result = createLlmvilleRuntime().runCommand(world, ACTOR, PICKUP_BUILD_ITEM_COMMAND, input);
    expect(result.ok).toBe(true);
    expect(declaredScope(PICKUP_BUILD_ITEM_COMMAND, input)).toEqual({ players: [ACTOR] });
  });
});

describe("rack command scopes", () => {
  const RACK_POSITION = { x: 10.5, y: 0, z: 10.5 };
  const RACK_ID = placedObjectInstanceId(RACK_POSITION);
  const RACK_CHUNK = worldChunkKeyAt(RACK_POSITION);

  function world(stocks: Partial<Record<string, Record<string, number>>>): GameRuntimeSnapshot {
    return withRack(baseSnapshot(stocks), RACK_POSITION);
  }

  test.each([
    [
      MOVE_RACK_HARDWARE_COMMAND,
      { [STOCK_ID.hardware]: { gpu_1: 1 } },
      { rackInstanceId: RACK_ID, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "slot" } },
    ],
    [
      INSTALL_RACK_COOLER_COMMAND,
      { [STOCK_ID.cooling]: { basic_rack_fan: 1 } },
      { rackInstanceId: RACK_ID, coolerId: "basic_rack_fan" },
    ],
  ])("%s scopes to the rack's own chunk", (commandName, stocks, input) => {
    const { snapshot, scope } = runScoped(world(stocks), commandName, input);
    expect(scope).toEqual({ players: [ACTOR], chunkKeys: [RACK_CHUNK] });
    expect(snapshot.dirty.chunks).toEqual([RACK_CHUNK]);
  });

  test.each([63.9999, -64.0001])("rounded rack ids hydrate the actual storage chunk at x=%s", (x) => {
    const position = { x, y: 0, z: 10.5 };
    const rackInstanceId = placedObjectInstanceId(position);
    const storedChunk = worldChunkKeyAt(position);
    expect(placedObjectChunkKey(rackInstanceId)).not.toBe(storedChunk);
    let snapshot = withRack(baseSnapshot({ [STOCK_ID.hardware]: { gpu_1: 1 }, [STOCK_ID.cooling]: { basic_rack_fan: 1 } }), position);
    for (const [command, input] of [
      [MOVE_RACK_HARDWARE_COMMAND, { rackInstanceId, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "slot" } }],
      [INSTALL_RACK_COOLER_COMMAND, { rackInstanceId, coolerId: "basic_rack_fan" }],
      [ASSIGN_RACK_CARD_COMMAND, { rackInstanceId, slotIndex: 0, lane: "training" }],
      [UNASSIGN_RACK_CARD_COMMAND, { rackInstanceId, slotIndex: 0 }],
      [UNINSTALL_RACK_COOLER_COMMAND, { rackInstanceId }],
    ] as const) {
      const scope = declaredScope(command, input);
      expect(scope?.chunkKeys).toContain(storedChunk);
      expect(scope?.chunkKeys?.length).toBe(2);
      snapshot = runScoped(hydrateOnly({ ...snapshot, dirty: CLEAN }, scope?.chunkKeys), command, input).snapshot;
      expect(snapshot.dirty.chunks).toContain(storedChunk);
    }
  });

  test("uninstallRackCooler scopes to the rack's own chunk", () => {
    const installed = runScoped(world({ [STOCK_ID.cooling]: { basic_rack_fan: 1 } }), INSTALL_RACK_COOLER_COMMAND, {
      rackInstanceId: RACK_ID,
      coolerId: "basic_rack_fan",
    }).snapshot;
    const { snapshot, scope } = runScoped({ ...installed, dirty: CLEAN }, UNINSTALL_RACK_COOLER_COMMAND, {
      rackInstanceId: RACK_ID,
    });
    expect(scope).toEqual({ players: [ACTOR], chunkKeys: [RACK_CHUNK] });
    expect(snapshot.dirty.chunks).toEqual([RACK_CHUNK]);
  });

  test("assign and unassign scope to the rack's own chunk", () => {
    const loaded = runScoped(world({ [STOCK_ID.hardware]: { gpu_1: 1 } }), MOVE_RACK_HARDWARE_COMMAND, {
      rackInstanceId: RACK_ID,
      from: { kind: "stock", hardwareId: "gpu_1" },
      to: { kind: "slot" },
    }).snapshot;

    const assigned = runScoped({ ...loaded, dirty: CLEAN }, ASSIGN_RACK_CARD_COMMAND, {
      rackInstanceId: RACK_ID,
      slotIndex: 0,
      lane: "training",
    });
    expect(assigned.scope).toEqual({ players: [ACTOR], chunkKeys: [RACK_CHUNK] });
    expect(assigned.snapshot.dirty.chunks).toEqual([RACK_CHUNK]);

    const unassigned = runScoped({ ...assigned.snapshot, dirty: CLEAN }, UNASSIGN_RACK_CARD_COMMAND, {
      rackInstanceId: RACK_ID,
      slotIndex: 0,
    });
    expect(unassigned.scope).toEqual({ players: [ACTOR], chunkKeys: [RACK_CHUNK] });
    expect(unassigned.snapshot.dirty.chunks).toEqual([RACK_CHUNK]);
  });

  test("a rack in a far chunk is scoped to that chunk, not the origin", () => {
    const farPosition = { x: 640.5, y: 0, z: -320.5 };
    const farId = placedObjectInstanceId(farPosition);
    const farChunk = worldChunkKeyAt(farPosition);
    expect(farChunk).not.toBe(RACK_CHUNK);

    const far = withRack(baseSnapshot({ [STOCK_ID.cooling]: { basic_rack_fan: 1 } }), farPosition);
    const { snapshot, scope } = runScoped(far, INSTALL_RACK_COOLER_COMMAND, {
      rackInstanceId: farId,
      coolerId: "basic_rack_fan",
    });
    expect(scope).toEqual({ players: [ACTOR], chunkKeys: [farChunk] });
    expect(snapshot.dirty.chunks).toEqual([farChunk]);
  });

  test("commandScopeEscape reports a scope that omits the written chunk", () => {
    const { snapshot } = runScoped(world({ [STOCK_ID.cooling]: { basic_rack_fan: 1 } }), INSTALL_RACK_COOLER_COMMAND, {
      rackInstanceId: RACK_ID,
      coolerId: "basic_rack_fan",
    });
    expect(
      commandScopeEscape({ players: [ACTOR], chunkKeys: [] }, snapshot.dirty, INSTALL_RACK_COOLER_COMMAND),
    ).toContain(RACK_CHUNK);
  });

  test("a malformed rack id scopes to no chunk and the command is rejected", () => {
    const input = { rackInstanceId: "not_an_object_id", slotIndex: 0 };
    expect(declaredScope(UNASSIGN_RACK_CARD_COMMAND, input)).toEqual({ players: [ACTOR], chunkKeys: [] });
    const result = createLlmvilleRuntime().runCommand(
      world({}),
      ACTOR,
      UNASSIGN_RACK_CARD_COMMAND,
      input,
    );
    expect(result).toEqual({ ok: false, reason: "Rack not found" });
  });
});
