import { describe, expect, test } from "bun:test";
import type { ColliderShape, EntityColliderSet } from "@jgengine/core/scene/colliders";
import {
  encodeCollisionMesh,
  prepareCollisionMesh,
  type CollisionMeshSource,
} from "@jgengine/core/scene/collisionMesh";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { createSceneRaycast, firstImpact, hitsUntilBlocked } from "@jgengine/core/scene/sceneRaycast";
import { createWorldSolids, type WorldSolidRayWork } from "../world/worldSolids";
import type { EntityPosition } from "./entityStore";

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

describe("sceneRaycast world solids", () => {
  test("finite segment validation applies before either candidate-query path", () => {
    let queries = 0;
    const api = createSceneRaycast({ solids: { inBox: () => { queries++; return []; } } });
    for (const maxDistance of [Infinity, NaN, -1]) {
      expect(() => api.raycast({ origin: [0, 0, 0], direction: [1, 0, 0], maxDistance })).toThrow(RangeError);
    }
    expect(() => api.raycast({ origin: [0, NaN, 0], direction: [1, 0, 0], maxDistance: 10 })).toThrow(RangeError);
    expect(() => api.raycast({ origin: [0, 0, 0], direction: [1, Infinity, 0], maxDistance: 10 })).toThrow(RangeError);
    expect(() => api.raycast({ origin: [0, 0, 0], direction: [Number.MAX_VALUE, Number.MAX_VALUE, 0], maxDistance: 10 })).toThrow(RangeError);
    expect(queries).toBe(0);
  });

  test("long diagonal misses and nearest hits avoid testing the city's off-ray solids", () => {
    let orientationReads = 0;
    const city = [];
    for (let x = 0; x < 128; x++) {
      for (let z = 0; z < 128; z++) {
        if (Math.abs(x - z) < 2) continue;
        city.push({ center: [x * 16 + 8, 1, z * 16 + 8] as const, halfExtents: [1, 1, 1] as const,
          get rotationY() { orientationReads++; return 0; },
        });
      }
    }
    const solids = createWorldSolids();
    solids.set("city", city);
    const work: WorldSolidRayWork = { cells: 0, entries: 0, bounds: 0 };
    const api = createSceneRaycast({ solids: { inBox: solids.inBox, inRay: (origin, direction, distance) => solids.inRay!(origin, direction, distance, work) } });
    const ray = { origin: [0, 1, 0] as const, direction: [1, 0, 1] as const, maxDistance: 2048 * Math.SQRT2 };
    orientationReads = 0;
    expect(api.raycast(ray)).toBeNull();
    expect(orientationReads).toBeLessThanOrEqual(256);
    expect(work.cells).toBeLessThanOrEqual(800);
    expect(work.bounds).toBe(0);
    expect(work.entries).toBe(0);
    solids.set("near-wall", [{ center: [12, 1, 12], halfExtents: [0.5, 1, 0.5],
      get rotationY() { orientationReads++; return 0; },
    }]);
    orientationReads = 0;
    expect(api.raycast(ray)?.distance).toBeCloseTo(11.5 * Math.SQRT2);
    expect(orientationReads).toBeLessThanOrEqual(256);
    expect(work.cells).toBeLessThanOrEqual(800);
    expect(work.bounds).toBe(1);
    expect(work.entries).toBe(1);
  });

  test("indexed solids share ordering, filters and accept policy with existing hit kinds", () => {
    const solids = createWorldSolids();
    solids.set("walls", [
      { center: [20, 1, 4], halfExtents: [21, 1, 0.5] },
      { center: [0, 1, 8], halfExtents: [1, 1, 0.5] },
    ]);
    const objects = createObjectStore();
    objects.place("crate", 0, 1, 6, { instanceId: "crate" });
    const queries: { min: EntityPosition; max: EntityPosition }[] = [];
    const api = createSceneRaycast({
      solids: { inBox(min, max) { queries.push({ min, max }); return solids.inBox(min, max); } },
      objects: { list: () => objects.list(), inBox: (min, max) => objects.inBox(min, max) },
      entities: {
        list: () => [{ id: "target", position: [0, 1, 10], rotationY: 0 }],
        collidersOf: () => ({ hitboxes: [{ name: "target", purpose: "damage", shape: { kind: "sphere", radius: 0.5 } }] }),
      },
      walls: [{ id: "manual-wall", a: [-1, 7], b: [1, 7], halfHeight: 2 }],
      terrain: { sampleHeight: () => 0 },
    });
    const ray = { origin: [0, 1, 0] as const, direction: [0, 0, 17] as const, maxDistance: 12, filter: { terrain: false } };
    const hits = api.raycastAll(ray);
    expect(hits.map((hit) => hit.instanceId)).toEqual(["world-solid", "crate", "manual-wall", "world-solid", "target"]);
    expect(hits.map((hit) => hit.distance)).toEqual([3.5, 5.5, 6.75, 7.5, 9.5]);
    expect(hits[0]).toMatchObject({ targetKind: "wall", purpose: "physical", damageEligible: false, blocks: true, point: [0, 1, 3.5], normal: [0, 0, -1] });
    expect(queries).toEqual([{ min: [0, 1, 0], max: [0, 1, 12] }]);
    expect(api.raycast(ray)?.instanceId).toBe("world-solid");
    const beforeFilter = queries.length;
    expect(api.raycast({ ...ray, filter: { ...ray.filter, walls: false } })?.instanceId).toBe("crate");
    expect(queries).toHaveLength(beforeFilter);
    expect(api.raycast({ ...ray, excludeInstanceIds: new Set(["world-solid", "crate"]) })?.instanceId).toBe("manual-wall");
    expect(queries).toHaveLength(beforeFilter);
    expect(api.raycast({ ...ray, accept: (hit) => hit.damageEligible })?.instanceId).toBe("target");
    expect(api.raycast({ ...ray, accept: (hit) => hit.instanceId === "world-solid" && hit.distance > 6 })?.distance).toBe(7.5);
    expect(api.raycast({ ...ray, maxDistance: 3.49 })).toBeNull();
    expect(api.raycast({ ...ray, maxDistance: 3.5 })?.distance).toBe(3.5);
    expect(api.raycast({ ...ray, direction: [0, 0, -1] })).toBeNull();
    const beforeZero = queries.length;
    expect(api.raycast({ ...ray, direction: [0, 0, 0] })).toBeNull();
    expect(queries).toHaveLength(beforeZero);
    solids.remove("walls");
    expect(api.raycast(ray)?.instanceId).toBe("crate");
    solids.restore({ layers: { restored: [{ center: [0, 1, 2], halfExtents: [1, 1, 0.25] }] } });
    expect(api.raycast(ray)?.distance).toBe(1.75);
    expect(api.raycast({ origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 10 })?.targetKind).toBe("terrain");
  });

  test("yawed solid hits use its oriented box and return world normals without filling empty corners", () => {
    const solids = createWorldSolids();
    solids.set("angled-wall", [{ center: [5, 2, 5], halfExtents: [2, 1, 0.25], rotationY: Math.PI / 4 }]);
    const api = createSceneRaycast({ solids });
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);
    const hit = api.raycast({ origin: [5 - 4 * cos, 2, 5 + 4 * sin], direction: [cos, 0, -sin], maxDistance: 8 });
    expect(hit?.distance).toBeCloseTo(2);
    expect(hit?.normal[0]).toBeCloseTo(-cos);
    expect(hit?.normal[2]).toBeCloseTo(sin);
    expect(hit?.point[0]).toBeCloseTo(5 - 2 * cos);
    expect(hit?.point[2]).toBeCloseTo(5 + 2 * sin);
    expect(api.raycast({ origin: [6.4, 5, 6.4], direction: [0, -1, 0], maxDistance: 5 })).toBeNull();
    expect(api.raycast({ origin: [5, 5, 5], direction: [0, -1, 0], maxDistance: 5 })?.distance).toBeCloseTo(2);
    expect(api.raycast({ origin: [5, 2, 5], direction: [0, 1, 0], maxDistance: 5 })?.distance).toBe(0);
  });
});

describe("sceneRaycast mesh colliders", () => {
  // Torus (major radius 1, tube radius 0.3, hole axis +Z) as an index-shared triangle soup.
  function torusSource(major = 32, tube = 16, ringRadius = 1, tubeRadius = 0.3): CollisionMeshSource {
    const positions: number[] = [];
    for (let i = 0; i < major; i += 1) {
      const a = (i / major) * Math.PI * 2;
      for (let j = 0; j < tube; j += 1) {
        const b = (j / tube) * Math.PI * 2;
        positions.push(
          Math.cos(a) * (ringRadius + Math.cos(b) * tubeRadius),
          Math.sin(a) * (ringRadius + Math.cos(b) * tubeRadius),
          Math.sin(b) * tubeRadius,
        );
      }
    }
    const vertexAt = (i: number, j: number): number => (i % major) * tube + (j % tube);
    const indices: number[] = [];
    for (let i = 0; i < major; i += 1) {
      for (let j = 0; j < tube; j += 1) {
        indices.push(
          vertexAt(i, j),
          vertexAt(i + 1, j),
          vertexAt(i + 1, j + 1),
          vertexAt(i, j),
          vertexAt(i + 1, j + 1),
          vertexAt(i, j + 1),
        );
      }
    }
    return { positions, indices };
  }

  function torusHitboxSet(): EntityColliderSet {
    const data = encodeCollisionMesh(torusSource());
    const mesh = data === null ? null : prepareCollisionMesh(data);
    if (mesh === null) throw new Error("torus mesh failed to prepare");
    // meshTranslate [0,0,0] pins the hole center on the entity position; halfExtents is the fitted box.
    const shape: ColliderShape = {
      kind: "mesh",
      mesh,
      meshScale: 1,
      meshTranslate: [0, 0, 0],
      halfExtents: [1.3, 1.3, 0.3],
    };
    return { hitboxes: [{ name: "body", purpose: "damage", shape }] };
  }

  test("a mesh damage hitbox lets a shot through the hole but stops at the ring", () => {
    const set = torusHitboxSet();
    const api = createSceneRaycast({
      entities: {
        list: () => [{ id: "donut", position: [0, 0, 4], rotationY: 0 }],
        collidersOf: () => set,
      },
    });
    // Straight through the hole center — only the fitted box would (wrongly) block here.
    const through = api.raycast({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(through).toBeNull();
    // Offset onto the tube ring — hits the actual triangles.
    const ring = api.raycast({ origin: [1, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(ring?.instanceId).toBe("donut");
    expect(ring?.colliderName).toBe("body");
    expect(ring?.damageEligible).toBe(true);
    expect(ring?.distance).toBeCloseTo(3.7, 1);
  });

  test("a mesh collider respects entity rotationY", () => {
    const set = torusHitboxSet();
    const api = createSceneRaycast({
      entities: {
        // Yaw pi/2 turns the hole axis to +X, so the straight Z-ray now strikes the ring.
        list: () => [{ id: "donut", position: [0, 0, 4], rotationY: Math.PI / 2 }],
        collidersOf: () => set,
      },
    });
    const zRay = api.raycast({ origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 20 });
    expect(zRay?.instanceId).toBe("donut");
    expect(zRay?.distance).toBeCloseTo(2.7, 1);
  });
});
