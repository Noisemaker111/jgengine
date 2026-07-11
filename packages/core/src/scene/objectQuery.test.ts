import { describe, expect, test } from "bun:test";
import { raycastObjects, raycastObjectsAll } from "@jgengine/core/scene/objectQuery";
import { createObjectStore, type SceneObject } from "@jgengine/core/scene/objectStore";

function object(instanceId: string, position: readonly [number, number, number]): SceneObject {
  return { instanceId, catalogId: "crate", position, rotationY: 0 };
}

describe("raycastObjects", () => {
  test("hits along +x with a -x face normal", () => {
    const crate = object("a", [5, 0, 0]);
    const hit = raycastObjects([crate], { origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 });
    expect(hit).not.toBeNull();
    expect(hit?.instanceId).toBe("a");
    expect(hit?.normal).toEqual([-1, 0, 0]);
    expect(hit?.distance).toBeCloseTo(4.5);
    expect(hit?.point[0]).toBeCloseTo(4.5);
  });

  test("hits along -z with a +z face normal", () => {
    const crate = object("a", [0, 0, -5]);
    const hit = raycastObjects([crate], { origin: [0, 0, 0], direction: [0, 0, -1], maxDistance: 20 });
    expect(hit).not.toBeNull();
    expect(hit?.normal).toEqual([0, 0, 1]);
    expect(hit?.distance).toBeCloseTo(4.5);
  });

  test("hits along +y with a -y face normal", () => {
    const crate = object("a", [0, 5, 0]);
    const hit = raycastObjects([crate], { origin: [0, 0, 0], direction: [0, 1, 0], maxDistance: 20 });
    expect(hit).not.toBeNull();
    expect(hit?.normal).toEqual([0, -1, 0]);
  });

  test("returns the nearest hit first, ordered by distance for raycastObjectsAll", () => {
    const near = object("near", [3, 0, 0]);
    const far = object("far", [8, 0, 0]);
    const hit = raycastObjects([far, near], { origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 });
    expect(hit?.instanceId).toBe("near");

    const all = raycastObjectsAll([far, near], { origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 });
    expect(all.map((h) => h.instanceId)).toEqual(["near", "far"]);
    expect(all[0]!.distance).toBeLessThan(all[1]!.distance);
  });

  test("filter excludes matching objects", () => {
    const crate = object("crate", [3, 0, 0]);
    const barrel = object("barrel", [3, 0, 0]);
    const hit = raycastObjects([crate, barrel], {
      origin: [0, 0, 0],
      direction: [1, 0, 0],
      maxDistance: 20,
      filter: (object) => object.instanceId !== "crate",
    });
    expect(hit?.instanceId).toBe("barrel");
  });

  test("misses when nothing is within range or in the ray path", () => {
    const crate = object("a", [0, 0, 10]);
    expect(
      raycastObjects([crate], { origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 }),
    ).toBeNull();
    expect(
      raycastObjects([crate], { origin: [0, 0, 0], direction: [0, 0, 1], maxDistance: 5 }),
    ).toBeNull();
  });

  test("hits along a diagonal ray", () => {
    const crate = object("a", [4, 0, 4]);
    const direction = [1, 0, 1] as const;
    const hit = raycastObjects([crate], { origin: [0, 0, 0], direction, maxDistance: 20 });
    expect(hit).not.toBeNull();
    expect(hit?.instanceId).toBe("a");
    expect(hit?.point[0]).toBeCloseTo(hit?.point[2] ?? -1);
  });

  test("broadphase inBox source finds the near object without scanning the far one", () => {
    const store = createObjectStore();
    store.place("crate", 5, 0, 0, { instanceId: "near" });
    store.place("crate", 200, 0, 0, { instanceId: "far" });
    let boxes = 0;
    const source = {
      inBox(min: readonly [number, number, number], max: readonly [number, number, number]) {
        boxes += 1;
        return store.inBox(min, max);
      },
    };
    const hit = raycastObjects(source, { origin: [0, 0, 0], direction: [1, 0, 0], maxDistance: 20 });
    expect(hit?.instanceId).toBe("near");
    expect(boxes).toBe(1);
    expect(store.inBox([-1, -1, -1], [20.5, 1, 1]).map((o) => o.instanceId)).toEqual(["near"]);
  });
});
