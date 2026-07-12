import { describe, expect, test } from "bun:test";
import { talkable, wander } from "@jgengine/core/scene/behaviors";
import { createEntityStore, groundSpeed, movedWhileFrozen } from "@jgengine/core/scene/entityStore";

describe("scene entity store", () => {
  test("spawn generates unique monotonic ids when omitted", () => {
    const store = createEntityStore();
    const first = store.spawn("rack.basic", { position: [0, 0, 0] });
    const second = store.spawn("rack.basic", { position: [1, 0, 0] });
    expect(first).not.toEqual(second);
    expect(store.list().map((entity) => entity.id).sort()).toEqual([first, second].sort());
  });

  test("spawn throws on explicit duplicate id", () => {
    const store = createEntityStore();
    store.spawn("rack.basic", { id: "hero", position: [0, 0, 0] });
    expect(() => store.spawn("rack.gpu", { id: "hero", position: [1, 0, 0] })).toThrow();
  });

  test("spawn defaults rotationY 0, role prop, empty movement and behaviors, origin position", () => {
    const store = createEntityStore();
    const id = store.spawn("rack.basic");
    const entity = store.get(id);
    expect(entity?.name).toBe("rack.basic");
    expect(entity?.position).toEqual([0, 0, 0]);
    expect(entity?.rotationY).toBe(0);
    expect(entity?.role).toBe("prop");
    expect(entity?.movement).toEqual({});
    expect(entity?.behaviors).toEqual([]);
  });

  test("spawn accepts both tuple and point positions and stores the tuple", () => {
    const store = createEntityStore();
    const fromTuple = store.spawn("bench", { position: [1, 2, 3] });
    const fromPoint = store.spawn("bench", { position: { x: 4, y: 5, z: 6 } });
    expect(store.get(fromTuple)?.position).toEqual([1, 2, 3]);
    expect(store.get(fromPoint)?.position).toEqual([4, 5, 6]);
  });

  test("spawn stores role, movement, and behaviors", () => {
    const store = createEntityStore();
    const behaviors = [talkable("shop_dialogue"), wander({ radius: 4 })];
    const id = store.spawn("shopkeeper", {
      position: [2, 0, 2],
      role: "npc",
      movement: { walkSpeed: 1.5 },
      behaviors,
    });
    const entity = store.get(id);
    expect(entity?.role).toBe("npc");
    expect(entity?.movement).toEqual({ walkSpeed: 1.5 });
    expect(entity?.behaviors).toEqual(behaviors);
  });

  test("despawn removes the entity and reports whether it existed", () => {
    const store = createEntityStore();
    const id = store.spawn("rack.basic", { position: [0, 0, 0] });
    expect(store.despawn(id)).toBe(true);
    expect(store.get(id)).toBeNull();
    expect(store.despawn(id)).toBe(false);
  });

  test("update patches position, rotationY, and meta", () => {
    const store = createEntityStore<{ label: string }>();
    const id = store.spawn("rack.basic", { position: [0, 0, 0], meta: { label: "a" } });
    expect(store.update(id, { position: [1, 2, 3], rotationY: Math.PI, meta: { label: "b" } })).toBe(true);
    const updated = store.get(id);
    expect(updated?.position).toEqual([1, 2, 3]);
    expect(updated?.rotationY).toBe(Math.PI);
    expect(updated?.meta).toEqual({ label: "b" });
  });

  test("update patches role, movement, and behaviors", () => {
    const store = createEntityStore();
    const id = store.spawn("shopkeeper", { position: [0, 0, 0] });
    const behaviors = [wander({ radius: 2 })];
    expect(store.update(id, { role: "npc", movement: { walkSpeed: 3 }, behaviors })).toBe(true);
    const updated = store.get(id);
    expect(updated?.role).toBe("npc");
    expect(updated?.movement).toEqual({ walkSpeed: 3 });
    expect(updated?.behaviors).toEqual(behaviors);
  });

  test("update returns false for unknown id", () => {
    const store = createEntityStore();
    expect(store.update("missing", { rotationY: 1 })).toBe(false);
  });

  test("setPose sets position and only the provided rotations", () => {
    const store = createEntityStore();
    const id = store.spawn("shopkeeper", { position: [0, 0, 0], rotationY: 1, rotationX: 0.2, rotationZ: 0.3 });
    expect(store.setPose(id, { position: { x: 4, y: 0, z: 2 }, rotationY: 2 })).toBe(true);
    const posed = store.get(id);
    expect(posed?.position).toEqual([4, 0, 2]);
    expect(posed?.rotationY).toBe(2);
    expect(posed?.rotationX).toBe(0.2);
    expect(posed?.rotationZ).toBe(0.3);
    expect(store.setPose("missing", { position: [0, 0, 0] })).toBe(false);
  });

  test("setPose mutates the entity in place and notifies", () => {
    const store = createEntityStore();
    const id = store.spawn("runner", { position: [0, 0, 0] });
    const before = store.get(id);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.setPose(id, { position: [3, 0, 4], rotationY: 1.5, dt: 1 });
    const after = store.get(id);
    expect(after).toBe(before);
    expect(after?.position).toEqual([3, 0, 4]);
    expect(after?.velocity).toEqual([3, 0, 4]);
    expect(after?.rotationY).toBe(1.5);
    expect(notified).toBe(1);
  });

  test("repeated setPose coalesces snapshot rebuild until read", () => {
    const store = createEntityStore();
    const id = store.spawn("runner", { position: [0, 0, 0] });
    const first = store.snapshot();
    store.setPose(id, { position: [1, 0, 0] });
    store.setPose(id, { position: [2, 0, 0] });
    store.setPose(id, { position: [3, 0, 0] });
    const second = store.snapshot();
    expect(second).not.toBe(first);
    expect(store.snapshot()).toBe(second);
    expect(second[0]?.position).toEqual([3, 0, 0]);
    expect(second[0]).toBe(store.get(id));
  });

  test("get and list reflect current contents", () => {
    const store = createEntityStore();
    expect(store.list()).toEqual([]);
    const id = store.spawn("rack.basic", { position: [0, 0, 0] });
    expect(store.get(id)?.name).toBe("rack.basic");
    expect(store.list()).toHaveLength(1);
  });

  test("clear removes all entities", () => {
    const store = createEntityStore();
    store.spawn("rack.basic", { position: [0, 0, 0] });
    store.spawn("rack.gpu", { position: [1, 0, 0] });
    store.clear();
    expect(store.list()).toEqual([]);
  });

  test("snapshot is referentially stable until a mutation occurs", () => {
    const store = createEntityStore();
    const empty = store.snapshot();
    expect(store.snapshot()).toBe(empty);

    const id = store.spawn("rack.basic", { position: [0, 0, 0] });
    const afterSpawn = store.snapshot();
    expect(store.snapshot()).toBe(afterSpawn);
    expect(afterSpawn).not.toBe(empty);

    store.despawn(id);
    expect(store.snapshot()).toBe(empty);
  });

  test("subscribe fires once per mutation and unsubscribe stops notifications", () => {
    const store = createEntityStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    const id = store.spawn("rack.basic", { position: [0, 0, 0] });
    store.update(id, { rotationY: 1 });
    store.despawn(id);
    expect(notified).toBe(3);

    unsubscribe();
    store.spawn("rack.basic", { position: [0, 0, 0] });
    expect(notified).toBe(3);
  });

  test("fresh entity has zero velocity", () => {
    const store = createEntityStore();
    const id = store.spawn("car");
    expect(store.get(id)?.velocity).toEqual([0, 0, 0]);
  });

  test("setPose with dt derives velocity from the position delta", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPose(id, { position: [2, 0, 6], dt: 2 });
    expect(store.get(id)?.velocity).toEqual([1, 0, 3]);
  });

  test("setPose without dt leaves velocity unchanged (teleport)", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPose(id, { position: [1, 0, 1], dt: 1 });
    store.setPose(id, { position: [50, 0, 50] });
    expect(store.get(id)?.velocity).toEqual([1, 0, 1]);
  });

  test("groundSpeed is the horizontal magnitude, ignoring vertical", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPose(id, { position: [3, 10, 4], dt: 1 });
    expect(groundSpeed(store.get(id)!)).toBeCloseTo(5);
  });

  test("spawnPoseOf reports the pose recorded at spawn, unaffected by later moves", () => {
    const store = createEntityStore();
    const id = store.spawn("hero", { position: [1, 0, 2], rotationY: 0.5 });
    store.setPose(id, { position: [9, 0, 9], rotationY: 3 });
    expect(store.spawnPoseOf(id)).toEqual({ position: [1, 0, 2], rotationY: 0.5 });
  });

  test("spawnPoseOf returns null for an unknown id", () => {
    const store = createEntityStore();
    expect(store.spawnPoseOf("missing")).toBeNull();
  });

  test("resetToSpawn restores position, rotationY, and zeroes velocity", () => {
    const store = createEntityStore();
    const id = store.spawn("hero", { position: [1, 0, 2], rotationY: 0.5 });
    store.setPose(id, { position: [9, 0, 9], rotationY: 3, dt: 1 });
    expect(store.get(id)?.velocity).not.toEqual([0, 0, 0]);
    expect(store.resetToSpawn(id)).toBe(true);
    const reset = store.get(id);
    expect(reset?.position).toEqual([1, 0, 2]);
    expect(reset?.rotationY).toBe(0.5);
    expect(reset?.velocity).toEqual([0, 0, 0]);
  });

  test("resetToSpawn returns false for an unknown id and forgets the pose after despawn", () => {
    const store = createEntityStore();
    expect(store.resetToSpawn("missing")).toBe(false);
    const id = store.spawn("hero", { position: [1, 0, 2] });
    store.despawn(id);
    expect(store.spawnPoseOf(id)).toBeNull();
    expect(store.resetToSpawn(id)).toBe(false);
  });

  test("resetToSpawn notifies subscribers", () => {
    const store = createEntityStore();
    const id = store.spawn("hero", { position: [1, 0, 2] });
    store.setPose(id, { position: [9, 0, 9] });
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.resetToSpawn(id);
    expect(notified).toBe(1);
  });

  test("movement.frozen can be set on spawn and patched via update", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0], movement: { frozen: true } });
    expect(store.get(id)?.movement.frozen).toBe(true);
    store.update(id, { movement: { frozen: false } });
    expect(store.get(id)?.movement.frozen).toBe(false);
  });

  test("movedWhileFrozen is false when the entity is not frozen, regardless of speed", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPose(id, { position: [5, 0, 0], dt: 1 });
    expect(movedWhileFrozen(store.get(id)!)).toBe(false);
  });

  test("movedWhileFrozen is false for a frozen entity below the motion threshold", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0], movement: { frozen: true } });
    expect(movedWhileFrozen(store.get(id)!)).toBe(false);
  });

  test("movedWhileFrozen detects a frozen entity whose velocity exceeds the threshold", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0], movement: { frozen: true } });
    store.setPose(id, { position: [5, 0, 0], dt: 1 });
    expect(movedWhileFrozen(store.get(id)!)).toBe(true);
    expect(movedWhileFrozen(store.get(id)!, 10)).toBe(false);
  });

  test("spawn with meta roundtrips through get and list", () => {
    const store = createEntityStore<{ label: string }>();
    const id = store.spawn("rack.basic", { position: [0, 0, 0], meta: { label: "a" } });
    expect(store.get(id)?.meta).toEqual({ label: "a" });
    expect(store.list().find((entity) => entity.id === id)?.meta).toEqual({ label: "a" });
  });

  test("update with meta replaces it wholesale", () => {
    const store = createEntityStore<{ label: string }>();
    const id = store.spawn("rack.basic", { position: [0, 0, 0], meta: { label: "a" } });
    expect(store.update(id, { meta: { label: "b" } })).toBe(true);
    expect(store.get(id)?.meta).toEqual({ label: "b" });
  });

  test("onExisting keep returns the existing id untouched", () => {
    const store = createEntityStore();
    store.spawn("rack", { id: "hero", position: [1, 2, 3] });
    const id = store.spawn("rack.new", { id: "hero", position: [9, 9, 9], onExisting: "keep" });
    expect(id).toBe("hero");
    const entity = store.get("hero");
    expect(entity?.name).toBe("rack");
    expect(entity?.position).toEqual([1, 2, 3]);
  });

  test("onExisting replace respawns fresh, moving position and the recorded spawn pose", () => {
    const store = createEntityStore();
    store.spawn("rack", { id: "hero", position: [1, 2, 3], rotationY: 1 });
    store.setPose("hero", { position: [50, 0, 50], dt: 1 });
    const id = store.spawn("rack.new", { id: "hero", position: [9, 0, 9], rotationY: 2, onExisting: "replace" });
    expect(id).toBe("hero");
    const entity = store.get("hero");
    expect(entity?.name).toBe("rack.new");
    expect(entity?.position).toEqual([9, 0, 9]);
    expect(entity?.rotationY).toBe(2);
    expect(entity?.velocity).toEqual([0, 0, 0]);
    expect(store.spawnPoseOf("hero")).toEqual({ position: [9, 0, 9], rotationY: 2 });
  });

  test("onExisting default still throws on a duplicate id", () => {
    const store = createEntityStore();
    store.spawn("rack", { id: "hero" });
    expect(() => store.spawn("rack.gpu", { id: "hero" })).toThrow();
  });

  test("update with an object-form position normalizes to a tuple and does not derive velocity", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPose(id, { position: [1, 0, 1], dt: 1 });
    const velocityBefore = store.get(id)?.velocity;
    expect(store.update(id, { position: { x: 9, y: 0, z: 9 } })).toBe(true);
    const updated = store.get(id);
    expect(updated?.position).toEqual([9, 0, 9]);
    expect(updated?.velocity).toEqual(velocityBefore);
  });

  test("setPoseConstraint clamps the committed position and receives the full constraint frame", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    const frames: unknown[] = [];
    store.setPoseConstraint(id, (frame) => {
      frames.push(frame);
      return [Math.min(frame.next[0], 5), frame.next[1], frame.next[2]];
    });
    store.setPose(id, { position: [10, 0, 0], dt: 1 });
    expect(store.get(id)?.position).toEqual([5, 0, 0]);
    expect(frames).toEqual([{ entityId: id, current: [0, 0, 0], next: [10, 0, 0], dt: 1 }]);
  });

  test("a constraint returning undefined accepts the requested position unchanged", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPoseConstraint(id, () => undefined);
    store.setPose(id, { position: [3, 0, 0] });
    expect(store.get(id)?.position).toEqual([3, 0, 0]);
  });

  test("velocity derives from the constrained position, not the requested one", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPoseConstraint(id, (frame) => [Math.min(frame.next[0], 5), frame.next[1], frame.next[2]]);
    store.setPose(id, { position: [10, 0, 0], dt: 1 });
    expect(store.get(id)?.velocity).toEqual([5, 0, 0]);
  });

  test("setPoseConstraint(id, null) clears a previously registered constraint", () => {
    const store = createEntityStore();
    const id = store.spawn("car", { position: [0, 0, 0] });
    store.setPoseConstraint(id, () => [0, 0, 0]);
    store.setPoseConstraint(id, null);
    store.setPose(id, { position: [10, 0, 0] });
    expect(store.get(id)?.position).toEqual([10, 0, 0]);
  });

  test("despawn clears the constraint so a respawned id under the same id is unconstrained", () => {
    const store = createEntityStore();
    store.spawn("car", { id: "hero", position: [0, 0, 0] });
    store.setPoseConstraint("hero", () => [0, 0, 0]);
    store.despawn("hero");
    store.spawn("car", { id: "hero", position: [1, 1, 1] });
    store.setPose("hero", { position: [10, 0, 0] });
    expect(store.get("hero")?.position).toEqual([10, 0, 0]);
  });
});

describe("entity blackboard", () => {
  test("stores and reads per-entity scratch, isolated by key", () => {
    const store = createEntityStore();
    const id = store.spawn("guard");
    store.blackboard.set(id, "alert", 3);
    expect(store.blackboard.get<number>(id, "alert")).toBe(3);
    expect(store.blackboard.has(id, "alert")).toBe(true);
    expect(store.blackboard.get(id, "missing")).toBeUndefined();
  });

  test("timers report ready state and remaining time against a clock", () => {
    const store = createEntityStore();
    const id = store.spawn("gunner");
    expect(store.blackboard.ready(id, "shot", 0)).toBe(true);
    store.blackboard.arm(id, "shot", 1000);
    expect(store.blackboard.ready(id, "shot", 500)).toBe(false);
    expect(store.blackboard.remaining(id, "shot", 500)).toBe(500);
    expect(store.blackboard.ready(id, "shot", 1000)).toBe(true);
    expect(store.blackboard.remaining(id, "shot", 1000)).toBe(0);
  });

  test("despawn clears an entity's blackboard", () => {
    const store = createEntityStore();
    store.spawn("gunner", { id: "g1" });
    store.blackboard.arm("g1", "shot", 1000);
    store.despawn("g1");
    expect(store.blackboard.ready("g1", "shot", 0)).toBe(true);
    expect(store.blackboard.get("g1", "shot")).toBeUndefined();
  });

  test("replacing an id drops stale scratch", () => {
    const store = createEntityStore();
    store.spawn("gunner", { id: "g1" });
    store.blackboard.set("g1", "alert", 5);
    store.spawn("gunner", { id: "g1", onExisting: "replace" });
    expect(store.blackboard.get("g1", "alert")).toBeUndefined();
  });

  test("hydrate mirrors a snapshot: spawns missing, overwrites existing, despawns extras", () => {
    const host = createEntityStore<{ hp: number }>();
    host.spawn("hero", { id: "h", position: [1, 0, 2], role: "player", meta: { hp: 30 } });
    host.spawn("slime", { id: "s", position: [5, 0, 5], role: "npc", meta: { hp: 10 } });
    host.setPose("s", { position: [6, 0, 5], dt: 1 });

    const client = createEntityStore<{ hp: number }>();
    client.spawn("hero", { id: "h", position: [0, 0, 0], meta: { hp: 5 } });
    client.spawn("stale", { id: "z", position: [9, 0, 9] });

    client.hydrate(host.snapshot());

    const ids = client.list().map((entity) => entity.id).sort();
    expect(ids).toEqual(["h", "s"]);
    expect(client.get("z")).toBeNull();
    const hero = client.get("h")!;
    expect(hero.position).toEqual([1, 0, 2]);
    expect(hero.role).toBe("player");
    expect(hero.meta).toEqual({ hp: 30 });
    const slime = client.get("s")!;
    expect(slime.position).toEqual([6, 0, 5]);
    expect(slime.velocity).toEqual(host.get("s")!.velocity);
  });

  test("hydrate is idempotent and clears scratch for despawned entities", () => {
    const host = createEntityStore();
    host.spawn("a", { id: "a" });
    const client = createEntityStore();
    client.spawn("a", { id: "a" });
    client.spawn("b", { id: "b" });
    client.blackboard.set("b", "alert", 3);
    client.hydrate(host.snapshot());
    expect(client.blackboard.get("b", "alert")).toBeUndefined();
    client.hydrate(host.snapshot());
    expect(client.list().map((entity) => entity.id)).toEqual(["a"]);
  });
});
