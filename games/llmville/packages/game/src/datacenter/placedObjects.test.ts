import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import {
  createPlacedDecorObject,
  createPlacedRackObject,
  findPlacedObject,
  fromRuntimeObjectRow,
  insertPlacedObject,
  listPlacedObjects,
  placedObjectInstanceId,
  placedRackAssignmentMap,
  placedRackSnapshots,
  removePlacedObject,
  toRuntimeObjectRow,
  writePlacedObject,
  type PlacedRackObject,
} from "@llmville/game/datacenter/placedObjects";
import { worldChunkKeyAt } from "@llmville/game/datacenter/worldChunks";
import { CARDINAL } from "@llmville/game/world/cardinal";

function emptySnapshot(): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: { user_1: { userId: "user_1", inventories: {}, economy: {}, unlocks: [] } },
    chunks: {},
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
}

function rack(overrides: Partial<PlacedRackObject> = {}): PlacedRackObject {
  return {
    ...createPlacedRackObject({
      rackType: "air_rack_4",
      position: { x: 10.5, y: 0, z: 10.5 },
      direction: CARDINAL.E,
      ownerUserId: "user_1",
      placedAt: 1_700_000_000_000,
    }),
    ...overrides,
  };
}

describe("placedObjectInstanceId", () => {
  test("is deterministic for a position and distinct across positions", () => {
    expect(placedObjectInstanceId({ x: 1.5, y: 0, z: -2.25 })).toBe(
      placedObjectInstanceId({ x: 1.5, y: 0, z: -2.25 }),
    );
    expect(placedObjectInstanceId({ x: 1.5, y: 0, z: -2.25 })).not.toBe(
      placedObjectInstanceId({ x: 1.5, y: 0, z: -2.5 }),
    );
  });

  test("follows the object when it is picked up and re-placed elsewhere", () => {
    const first = createPlacedRackObject({
      rackType: "starter_rack",
      position: { x: 4.5, y: 0, z: 4.5 },
      direction: CARDINAL.N,
      ownerUserId: "user_1",
      placedAt: 1,
    });
    const second = createPlacedRackObject({
      rackType: "starter_rack",
      position: { x: 8.5, y: 0, z: 4.5 },
      direction: CARDINAL.N,
      ownerUserId: "user_1",
      placedAt: 2,
    });
    expect(second.instanceId).not.toBe(first.instanceId);
  });
});

describe("runtime object row conversion", () => {
  test("round-trips a rack with flags and slots", () => {
    const source = rack({
      state: "training",
      installedCoolerId: "basic_rack_fan",
      installedHardwareModuleIds: ["gpu_1", null, "gpu_2", null],
      assignments: [{ lane: "training" }, null, { lane: "serving", targetModelId: "model_a" }, null],
    });
    const row = toRuntimeObjectRow(source);
    expect(row.catalogId).toBe("air_rack_4");
    expect(row.position).toEqual([10.5, 0, 10.5]);
    expect(row.slots?.slots).toEqual([
      { itemId: "gpu_1", count: 1 },
      null,
      { itemId: "gpu_2", count: 1 },
      null,
    ]);
    expect(row.flags?.owner).toBe("user_1");

    const restored = fromRuntimeObjectRow(row);
    expect(restored).toEqual(source);
  });

  test("round-trips decor and derives its cardinal direction", () => {
    const decor = createPlacedDecorObject({
      itemId: "neon_sign",
      position: { x: 20.5, y: 0, z: 20.5 },
      direction: CARDINAL.S,
      ownerUserId: "user_1",
      placedAt: 5,
    });
    const restored = fromRuntimeObjectRow(toRuntimeObjectRow(decor));
    expect(restored).toEqual(decor);
    expect(restored?.direction).toBe(CARDINAL.S);
  });

  test("rejects a row whose catalog id is not a build item", () => {
    expect(
      fromRuntimeObjectRow({ instanceId: "obj_0_0_0", catalogId: "local-player", position: [0, 0, 0] }),
    ).toBeNull();
  });

  test("defaults rack flags that are missing or malformed", () => {
    const restored = fromRuntimeObjectRow({
      instanceId: "obj_0_0_0",
      catalogId: "starter_rack",
      position: [0, 0, 0],
      flags: { state: "exploding", cooler: "not_a_cooler", assignments: [{ lane: "nope" }, 7] },
    });
    expect(restored?.kind).toBe("rack");
    if (restored?.kind !== "rack") return;
    expect(restored.state).toBe("idle");
    expect(restored.installedCoolerId).toBeNull();
    expect(restored.assignments).toEqual([null, null]);
    expect(restored.installedHardwareModuleIds).toEqual([null, null]);
    expect(restored.ownerUserId).toBe("");
  });

  test("drops a serving assignment with no target model", () => {
    const restored = fromRuntimeObjectRow({
      instanceId: "obj_0_0_0",
      catalogId: "starter_rack",
      position: [0, 0, 0],
      flags: { assignments: [{ lane: "serving" }, { lane: "scraping" }] },
    });
    if (restored?.kind !== "rack") throw new Error("expected rack");
    expect(restored.assignments).toEqual([null, { lane: "scraping" }]);
  });
});

describe("snapshot chunk placement", () => {
  test("inserts into the position's chunk and marks it dirty", () => {
    const object = rack();
    const next = insertPlacedObject(emptySnapshot(), object);
    const chunkKey = worldChunkKeyAt(object.position);
    expect(next.dirty.chunks).toEqual([chunkKey]);
    expect(next.dirty.server).toBe(true);
    expect(next.chunks[chunkKey]?.objects).toHaveLength(1);
    expect(listPlacedObjects(next)).toHaveLength(1);
  });

  test("finds, rewrites, and removes an object by instance id", () => {
    const object = rack();
    const inserted = insertPlacedObject(emptySnapshot(), object);
    const found = findPlacedObject(inserted, object.instanceId);
    expect(found?.chunkKey).toBe(worldChunkKeyAt(object.position));

    const written = writePlacedObject(inserted, found!.chunkKey, {
      ...object,
      state: "training",
    });
    expect(findPlacedObject(written, object.instanceId)?.object).toMatchObject({ state: "training" });

    const removed = removePlacedObject(written, object.instanceId);
    expect(findPlacedObject(removed, object.instanceId)).toBeNull();
    expect(removed.dirty.chunks).toEqual([found!.chunkKey]);
  });

  test("removing an unknown object leaves the snapshot untouched", () => {
    const snapshot = emptySnapshot();
    expect(removePlacedObject(snapshot, "obj_missing")).toBe(snapshot);
  });

  test("objects in different chunks land under different keys", () => {
    const near = rack();
    const far = rack({
      instanceId: placedObjectInstanceId({ x: 500.5, y: 0, z: 10.5 }),
      position: { x: 500.5, y: 0, z: 10.5 },
    });
    const next = insertPlacedObject(insertPlacedObject(emptySnapshot(), near), far);
    expect(Object.keys(next.chunks)).toHaveLength(2);
    expect(next.dirty.chunks).toHaveLength(2);
  });
});

describe("placed rack projections", () => {
  test("rack snapshots key on the engine instance id", () => {
    const first = rack({ installedHardwareModuleIds: ["h100", null, null, null], installedCoolerId: "fan_basic" });
    const second = rack({
      instanceId: placedObjectInstanceId({ x: 20.5, y: 0, z: 10.5 }),
      position: { x: 20.5, y: 0, z: 10.5 },
    });
    expect(placedRackSnapshots([first, second])).toEqual([
      {
        rackId: first.instanceId,
        rackType: "air_rack_4",
        installedHardwareModuleIds: ["h100", null, null, null],
        installedCoolerId: "fan_basic",
      },
      {
        rackId: second.instanceId,
        rackType: "air_rack_4",
        installedHardwareModuleIds: second.installedHardwareModuleIds,
        installedCoolerId: null,
      },
    ]);
  });

  test("assignment map flattens per-rack slots to `${instanceId}:${slotIndex}`", () => {
    const target = rack({
      assignments: [{ lane: "training" }, null, { lane: "serving", targetModelId: "model_1" }, null],
    });
    expect(placedRackAssignmentMap([target], new Set(["model_1"]))).toEqual({
      [`${target.instanceId}:0`]: { lane: "training" },
      [`${target.instanceId}:2`]: { lane: "serving", targetModelId: "model_1" },
    });
  });

  test("racks with no assignments contribute nothing", () => {
    expect(placedRackAssignmentMap([rack()], new Set())).toEqual({});
    expect(placedRackAssignmentMap([], new Set())).toEqual({});
  });

  test("a serving slot whose target model is gone reads as unassigned", () => {
    const target = rack({
      assignments: [
        { lane: "serving", targetModelId: "deleted_model" },
        { lane: "scraping" },
        null,
        null,
      ],
    });
    expect(placedRackAssignmentMap([target], new Set(["model_1"]))).toEqual({
      [`${target.instanceId}:1`]: { lane: "scraping" },
    });
  });

  test("training and scraping slots survive an empty live-model set", () => {
    const target = rack({
      assignments: [{ lane: "training" }, { lane: "scraping" }, null, null],
    });
    expect(placedRackAssignmentMap([target], new Set())).toEqual({
      [`${target.instanceId}:0`]: { lane: "training" },
      [`${target.instanceId}:1`]: { lane: "scraping" },
    });
  });
});
