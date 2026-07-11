import { describe, expect, test } from "bun:test";
import type { EntityColliderSet } from "@jgengine/core/scene/colliders";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createSceneRaycast, firstImpact, hitsUntilBlocked } from "@jgengine/core/scene/sceneRaycast";

describe("sceneRaycast", () => {
  test("nearest-hit and ordered-all over entities with default colliders", () => {
    const positions: Record<string, readonly [number, number, number]> = {
      near: [0, 0, 5],
      far: [0, 0, 12],
    };
    const api = createSceneRaycast({
      entities: {
        list: () =>
          Object.entries(positions).map(([id, position]) => ({ id, position, rotationY: 0 })),
      },
    });
    const nearest = api.raycast({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(nearest?.instanceId).toBe("near");
    expect(nearest?.damageEligible).toBe(true);
    const all = api.raycastAll({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(all.map((h) => h.instanceId)).toEqual(["near", "far"]);
  });

  test("physical body blocks before a farther damage hitbox on another entity", () => {
    const colliders: Record<string, EntityColliderSet> = {
      wall: {
        body: {
          name: "hull",
          purpose: "physical",
          shape: { kind: "aabb", halfExtents: [1, 1, 0.2] },
        },
      },
      enemy: {
        hitboxes: [{ name: "body", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }],
      },
    };
    const api = createSceneRaycast({
      entities: {
        list: () => [
          { id: "wall", position: [0, 0, 4], rotationY: 0 },
          { id: "enemy", position: [0, 0, 10], rotationY: 0 },
        ],
        collidersOf: (id) => colliders[id],
      },
    });
    const all = api.raycastAll({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    const until = hitsUntilBlocked(all);
    expect(until.map((h) => h.instanceId)).toEqual(["wall"]);
    expect(firstImpact(all)?.damageEligible).toBe(false);
  });

  test("multiple named hitboxes on one entity with offsets", () => {
    const api = createSceneRaycast({
      entities: {
        list: () => [{ id: "soldier", position: [0, 0, 8], rotationY: 0 }],
        collidersOf: () => ({
          hitboxes: [
            { name: "torso", purpose: "damage", shape: { kind: "sphere", radius: 0.4 } },
            {
              name: "head",
              purpose: "damage",
              shape: { kind: "sphere", radius: 0.25, offset: [0, 1.5, 0] },
            },
          ],
        }),
      },
    });
    const headShot = api.raycast({
      origin: [0, 1.5, 0],
      direction: [0, 0, 1],
      maxDistance: 20,
    });
    expect(headShot?.colliderName).toBe("head");
    const bodyShot = api.raycast({
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      maxDistance: 20,
    });
    expect(bodyShot?.colliderName).toBe("torso");
  });

  test("object broadphase + physical defaults block", () => {
    const store = createObjectStore();
    store.place("crate", 0, 0, 6, { instanceId: "crate1" });
    store.place("crate", 50, 0, 50, { instanceId: "far" });
    const api = createSceneRaycast({
      objects: {
        list: () => store.list(),
        inBox: (min, max) => store.inBox(min, max),
      },
    });
    const hit = api.raycast({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(hit?.instanceId).toBe("crate1");
    expect(hit?.purpose).toBe("physical");
    expect(hit?.blocks).toBe(true);
  });

  test("terrain intersection reports a blocking ground hit", () => {
    const api = createSceneRaycast({
      terrain: { sampleHeight: () => 0 },
    });
    const hit = api.raycast({ origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 20 });
    expect(hit?.targetKind).toBe("terrain");
    expect(hit?.blocks).toBe(true);
    expect(hit?.point[1]).toBeCloseTo(0, 1);
  });

  test("wall segments block as physical solids", () => {
    const api = createSceneRaycast({
      walls: [{ id: "w1", a: [-2, 5], b: [2, 5], halfHeight: 2, thickness: 0.3 }],
    });
    const hit = api.raycast({ origin: [0, 1, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(hit?.targetKind).toBe("wall");
    expect(hit?.instanceId).toBe("w1");
  });

  test("excludeInstanceIds and accept filter", () => {
    const api = createSceneRaycast({
      entities: {
        list: () => [
          { id: "a", position: [0, 0, 3], rotationY: 0 },
          { id: "b", position: [0, 0, 6], rotationY: 0 },
        ],
      },
    });
    const hit = api.raycast({
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      maxDistance: 20,
      excludeInstanceIds: ["a"],
    });
    expect(hit?.instanceId).toBe("b");
    const onlyDamage = api.raycastAll({
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      maxDistance: 20,
      accept: (h) => h.damageEligible,
    });
    expect(onlyDamage.every((h) => h.damageEligible)).toBe(true);
  });

  test("ties order by instanceId then colliderName for stability", () => {
    const api = createSceneRaycast({
      entities: {
        list: () => [
          { id: "b", position: [0, 0, 5], rotationY: 0 },
          { id: "a", position: [0, 0, 5], rotationY: 0 },
        ],
      },
    });
    const all = api.raycastAll({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(all[0]!.instanceId <= all[1]!.instanceId).toBe(true);
  });
});
