import { describe, expect, test } from "bun:test";
import { createObjectStore } from "../scene/objectStore";
import { createPhysicsWorldBackend } from "./physicsWorldBackend";
import { syncWorldColliders } from "./worldColliders";

describe("syncWorldColliders", () => {
  test("named raycast hits subscribed static object and terrain heightfield", () => {
    const object = createObjectStore();
    const colliders = new Map<string, any>();
    const objectId = object.place("wall", 0, 1, -3);
    colliders.set(objectId, {
      body: { name: "wall", purpose: "physical", shape: { kind: "aabb", halfExtents: [2, 1, 0.2] } },
    });
    const ctx = {
      scene: { object: { ...object, collidersOf: (id: string) => colliders.get(id) ?? null } },
      world: { ground: { bounds: { w: 20, d: 20 }, sampleHeight: () => 0 } },
    } as any;
    const backend = createPhysicsWorldBackend({
      capacity: 8,
      bounds: { min: [-20, -20, -20], max: [20, 20, 20] },
      warn: false,
    });
    const sync = syncWorldColliders(backend, ctx);

    expect(backend.raycast({ origin: [0, 1, 0], direction: [0, 0, -1], maxDistance: 10 })?.body).toBe(2);
    expect(backend.raycast({ origin: [0, 3, 0], direction: [0, -1, 0], maxDistance: 10 })?.body).toBe(1);
    object.remove(objectId);
    colliders.delete(objectId);
    expect(backend.raycast({ origin: [0, 3, -3], direction: [0, 0, 1], maxDistance: 10 })).toBeNull();
    sync.dispose();
    backend.dispose();
  });
});
