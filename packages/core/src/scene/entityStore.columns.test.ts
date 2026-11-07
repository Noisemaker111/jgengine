import { describe, expect, test } from "bun:test";
import { createEntityStore, type EntityStore } from "@jgengine/core/scene/entityStore";

/** Every live entity's object fields equal its handle's columns. */
function expectMirrored(store: EntityStore): void {
  const { columns } = store;
  let live = 0;
  for (let handle = 0; handle < columns.span(); handle += 1) {
    if (!columns.isLive(handle)) continue;
    live += 1;
    const id = columns.idOf(handle)!;
    expect(columns.handleOf(id)).toBe(handle);
    const entity = store.get(id)!;
    const base = handle * 3;
    expect([...columns.positions().subarray(base, base + 3)]).toEqual([...entity.position]);
    expect([...columns.velocities().subarray(base, base + 3)]).toEqual([...entity.velocity]);
    expect([...columns.rotations().subarray(base, base + 3)]).toEqual([entity.rotationX, entity.rotationY, entity.rotationZ]);
  }
  expect(live).toBe(store.ids().length);
}

describe("entity columns", () => {
  test("every write by id keeps the columns equal to the entity objects", () => {
    const store = createEntityStore();
    store.spawn("a", { id: "a", position: [1, 2, 3], rotationY: 0.5, rotationX: 0.1, rotationZ: 0.2 });
    store.spawn("b", { id: "b", position: { x: 4, y: 5, z: 6 } });
    expectMirrored(store);
    store.setPose("a", { position: [2, 2, 3], rotationY: 1, dt: 0.5 });
    store.setVelocity("b", [7, 8, 9]);
    store.update("b", { position: [0, 1, 0], rotationX: 0.3, rotationZ: 0.4 });
    expectMirrored(store);
    store.resetToSpawn("a");
    expectMirrored(store);
    const host = createEntityStore();
    host.spawn("b", { id: "b", position: [9, 9, 9] });
    host.setVelocity("b", [1, 1, 1]);
    host.spawn("c", { id: "c", position: [3, 3, 3] });
    store.hydrate(host.snapshot());
    expect(store.columns.handleOf("a")).toBe(-1);
    expectMirrored(store);
  });

  test("writes by handle match writes by id, constraint, derived velocity and notifications included", () => {
    const byId = createEntityStore();
    const byHandle = createEntityStore();
    let notified = 0;
    byHandle.subscribe(() => { notified += 1; });
    for (const store of [byId, byHandle]) {
      store.spawn("walker", { id: "w", position: [0, 0, 0] });
      store.setPoseConstraint("w", ({ next }) => (next[0] > 5 ? [5, next[1], next[2]] : undefined));
    }
    const handle = byHandle.columns.handleOf("w");
    notified = 0;
    const before = byHandle.get("w")!.position;
    byId.setPose("w", { position: [3, 0, 4], dt: 1 });
    byHandle.columns.setPosition(handle, 3, 0, 4, 1);
    byId.setPose("w", { position: [9, 0, 4], dt: 0.5 });
    byHandle.columns.setPosition(handle, 9, 0, 4, 0.5);
    byId.setVelocity("w", [1, 2, 3]);
    byHandle.columns.setVelocity(handle, 1, 2, 3);
    expect(byHandle.get("w")).toEqual(byId.get("w")!);
    expect(byHandle.get("w")!.position).not.toBe(before);
    expect(notified).toBe(3);
    expectMirrored(byHandle);
    expect(byHandle.columns.setVelocity(handle, Number.NaN, 0, 0)).toBe(false);
    expect(byHandle.columns.setPosition(999, 0, 0, 0)).toBe(false);
  });

  test("a despawned handle is reused by the next spawn with its generation bumped", () => {
    const store = createEntityStore();
    store.spawn("a", { id: "a" });
    store.spawn("b", { id: "b" });
    const handle = store.columns.handleOf("a");
    const generation = store.columns.generationOf(handle);
    store.despawn("a");
    expect(store.columns.isLive(handle)).toBe(false);
    expect(store.columns.idOf(handle)).toBeUndefined();
    expect(store.columns.setPosition(handle, 1, 1, 1)).toBe(false);
    store.spawn("c", { id: "c", position: [4, 0, 4] });
    expect(store.columns.handleOf("c")).toBe(handle);
    expect(store.columns.generationOf(handle)).toBe(generation + 1);
    store.spawn("c2", { id: "c", onExisting: "replace" });
    expect(store.columns.generationOf(handle)).toBe(generation + 2);
    expect(store.columns.span()).toBe(2);
    expectMirrored(store);
  });

  test("the handle kept on each entity never shows up in spreads, JSON, clones or a hydrated copy", () => {
    const store = createEntityStore();
    store.spawn("a", { id: "a", position: [1, 2, 3], meta: { hp: 3 } });
    const entity = store.get("a")!;
    const plain = JSON.parse(JSON.stringify(entity));
    expect(JSON.stringify(entity)).not.toContain("andle");
    expect(Object.getOwnPropertySymbols({ ...entity })).toEqual([]);
    expect(Object.getOwnPropertySymbols(structuredClone(entity))).toEqual([]);
    expect(entity).toEqual(plain);
    const copy = createEntityStore();
    copy.hydrate(JSON.parse(JSON.stringify(store.snapshot())));
    expect(copy.get("a")).toEqual(entity);
    expect(copy.columns.handleOf("a")).toBe(0);
  });

  test("columns grow past their first allocation and keep every value", () => {
    const store = createEntityStore();
    for (let i = 0; i < 100; i += 1) store.spawn("p", { id: `p${i}`, position: [i, -i, i * 2] });
    expect(store.columns.span()).toBe(100);
    expectMirrored(store);
    store.clear();
    expect(store.columns.isLive(0)).toBe(false);
  });
});
