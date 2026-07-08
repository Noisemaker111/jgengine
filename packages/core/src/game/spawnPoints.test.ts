import { describe, expect, test } from "bun:test";
import { createSpawnPoints } from "@jgengine/core/game/spawnPoints";
import { createEntityStore } from "@jgengine/core/scene/entityStore";

describe("spawnPoints", () => {
  test("record then get round-trips the pose", () => {
    const points = createSpawnPoints();
    points.record("base_a", { x: 1, y: 0, z: 2, rotationY: 0.5 });
    expect(points.get("base_a")).toEqual({ x: 1, y: 0, z: 2, rotationY: 0.5 });
  });

  test("get returns undefined for an unrecorded id", () => {
    const points = createSpawnPoints();
    expect(points.get("missing")).toBeUndefined();
  });

  test("list reflects every recorded point", () => {
    const points = createSpawnPoints();
    points.record("a", { x: 0, y: 0, z: 0 });
    points.record("b", { x: 5, y: 0, z: 5 });
    expect(points.list().map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  test("respawn moves an entity onto a recorded point and applies its rotation", () => {
    const store = createEntityStore();
    const points = createSpawnPoints();
    const id = store.spawn("hero", { position: [0, 0, 0], rotationY: 0 });
    points.record("base_a", { x: 4, y: 0, z: 2, rotationY: 1.25 });
    expect(points.respawn(store, id, "base_a")).toBe(true);
    const entity = store.get(id);
    expect(entity?.position).toEqual([4, 0, 2]);
    expect(entity?.rotationY).toBe(1.25);
  });

  test("respawn leaves rotation untouched when the recorded point has none", () => {
    const store = createEntityStore();
    const points = createSpawnPoints();
    const id = store.spawn("hero", { position: [0, 0, 0], rotationY: 2 });
    points.record("base_a", { x: 4, y: 0, z: 2 });
    expect(points.respawn(store, id, "base_a")).toBe(true);
    const entity = store.get(id);
    expect(entity?.position).toEqual([4, 0, 2]);
    expect(entity?.rotationY).toBe(2);
  });

  test("respawn returns false for an unknown spawn id or entity id", () => {
    const store = createEntityStore();
    const points = createSpawnPoints();
    const id = store.spawn("hero", { position: [0, 0, 0] });
    points.record("base_a", { x: 4, y: 0, z: 2 });
    expect(points.respawn(store, id, "missing")).toBe(false);
    expect(points.respawn(store, "missing", "base_a")).toBe(false);
  });
});
