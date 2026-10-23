import { expect, test } from "bun:test";
import { defaultObjectColliders } from "../scene/colliders";
import type { EntityPosition } from "../scene/entityStore";
import { createWorldSolids } from "../world/worldSolids";
import {
  createObstacleReachCache,
  resolveSourceWalkerStep,
  type SolidObstacleSource,
} from "./solidObstacles";

type SourceObject = { instanceId: string; position: EntityPosition; rotationY: number };

function sourceOf(objects: readonly SourceObject[]): SolidObstacleSource {
  return {
    list: () => objects,
    inBox: (min, max) =>
      objects.filter(
        (object) =>
          object.position[0] >= min[0] &&
          object.position[0] <= max[0] &&
          object.position[1] >= min[1] &&
          object.position[1] <= max[1] &&
          object.position[2] >= min[2] &&
          object.position[2] <= max[2],
      ),
    collidersOf: () => defaultObjectColliders([1, 1, 1]),
  };
}

/**
 * The scene's own shape: a mutable object list plus a version that moves whenever membership, a
 * position or a rotation changes. This is what makes the obstacle index legal to reuse.
 */
function versionedSourceOf(objects: SourceObject[]): SolidObstacleSource & { bump: () => void } {
  let version = 0;
  const base = sourceOf(objects);
  return {
    ...base,
    list: () => objects,
    version: () => version,
    bump: () => {
      version += 1;
    },
  };
}

test("a step into a wall is cut on the blocked axis and preserved on the other", () => {
  const source = sourceOf([{ instanceId: "wall", position: [2, 0, 0], rotationY: 0 }]);
  const step = resolveSourceWalkerStep(
    source,
    createObstacleReachCache(),
    [0, 0, 0],
    1,
    1,
  );
  expect(step.stepX).toBeLessThan(1);
  expect(step.stepZ).toBe(1);
});

test("an empty source leaves the step untouched", () => {
  const step = resolveSourceWalkerStep(sourceOf([]), createObstacleReachCache(), [0, 0, 0], 1, -0.5);
  expect(step).toEqual({ stepX: 1, stepZ: -0.5 });
});

test("a bare source shares indexed world solids and observes layer changes without an object change", () => {
  const solids = createWorldSolids();
  const queries: { min: EntityPosition; max: EntityPosition }[] = [];
  const source: SolidObstacleSource = {
    ...sourceOf([]),
    solids: {
      count: () => solids.count(),
      inBox(min, max) {
        queries.push({ min, max });
        return solids.inBox(min, max);
      },
    },
  };
  const cache = createObstacleReachCache();
  solids.set("wall", [{ center: [20, 1, 0], halfExtents: [19, 1, 2] }]);
  const blocked = resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0.5);
  expect(blocked.stepX).toBeCloseTo(0.7);
  expect(blocked.stepZ).toBe(0.5);
  expect(queries).toEqual([{ min: [-2.3, -1.8, -0.8], max: [2.3, 3.6, 0.8] }]);
  solids.remove("wall");
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0.5)).toEqual({ stepX: 2, stepZ: 0.5 });
  expect(queries).toHaveLength(1);
  solids.set("wall", [{ center: [0, 1, 3], halfExtents: [1, 1, 1] }]);
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 0, 3).stepZ).toBeCloseTo(1.7);
});

test("the reach cache is reused across steps and refreshed when the source grows", () => {
  const objects: SourceObject[] = [{ instanceId: "wall", position: [2, 0, 0], rotationY: 0 }];
  let listCalls = 0;
  const base = sourceOf(objects);
  const source: SolidObstacleSource = {
    ...base,
    list: () => {
      listCalls += 1;
      return objects;
    },
  };
  const cache = createObstacleReachCache();
  resolveSourceWalkerStep(source, cache, [0, 0, 0], 0.1, 0);
  const afterFirst = cache.value;
  resolveSourceWalkerStep(source, cache, [0, 0, 0], 0.1, 0);
  expect(cache.value).toBe(afterFirst);
  expect(listCalls).toBe(2);

  objects.push({ instanceId: "wall_2", position: [-2, 0, 0], rotationY: 0 });
  resolveSourceWalkerStep(source, cache, [0, 0, 0], 0.1, 0);
  expect(cache.count).toBe(2);
});

test("a versioned source is indexed once and a step costs no source scan", () => {
  const objects: SourceObject[] = [{ instanceId: "wall", position: [2, 0, 0], rotationY: 0 }];
  let listCalls = 0;
  const versioned = versionedSourceOf(objects);
  const source: SolidObstacleSource = {
    ...versioned,
    list: () => {
      listCalls += 1;
      return objects;
    },
  };
  const cache = createObstacleReachCache();
  for (let step = 0; step < 25; step += 1) {
    resolveSourceWalkerStep(source, cache, [0, 0, 0], 0.1, 0);
  }
  expect(listCalls).toBe(1);
});

test("an obstacle added this tick blocks the step, and one removed this tick frees it", () => {
  const objects: SourceObject[] = [];
  const source = versionedSourceOf(objects);
  const cache = createObstacleReachCache();
  // Warm the index on an empty world; the step must be free.
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0)).toEqual({ stepX: 2, stepZ: 0 });

  objects.push({ instanceId: "wall", position: [2, 0, 0], rotationY: 0 });
  source.bump();
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0).stepX).toBeLessThan(2);

  objects.length = 0;
  source.bump();
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0)).toEqual({ stepX: 2, stepZ: 0 });
});

test("a moved or rotated obstacle is seen without rebuilding the whole reach by hand", () => {
  const objects: SourceObject[] = [{ instanceId: "wall", position: [10, 0, 0], rotationY: 0 }];
  const source = versionedSourceOf(objects);
  const cache = createObstacleReachCache();
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0)).toEqual({ stepX: 2, stepZ: 0 });

  objects[0] = { instanceId: "wall", position: [2, 0, 0], rotationY: 0 };
  source.bump();
  expect(resolveSourceWalkerStep(source, cache, [0, 0, 0], 2, 0).stepX).toBeLessThan(2);
});

test("the indexed path takes the same steps as the per-query gather for the same world", () => {
  let seed = 19;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const objects: SourceObject[] = Array.from({ length: 60 }, (_, index) => ({
    instanceId: `solid-${index}`,
    position: [random() * 40 - 20, 0, random() * 40 - 20] as EntityPosition,
    rotationY: random() < 0.5 ? 0 : random() * Math.PI,
  }));
  const indexed = versionedSourceOf(objects);
  const plain = sourceOf(objects);
  const indexedCache = createObstacleReachCache();
  const plainCache = createObstacleReachCache();

  const path = (source: SolidObstacleSource, cache: ReturnType<typeof createObstacleReachCache>) => {
    const trail: number[][] = [];
    let blocked = false;
    let position: EntityPosition = [0, 0, 0];
    for (let frame = 0; frame < 240; frame += 1) {
      const stepX = Math.cos(frame / 24) * 0.25;
      const stepZ = Math.sin(frame / 24) * 0.25;
      const step = resolveSourceWalkerStep(source, cache, position, stepX, stepZ);
      if (step.stepX !== stepX || step.stepZ !== stepZ) blocked = true;
      position = [position[0] + step.stepX, position[1], position[2] + step.stepZ];
      trail.push([...position]);
    }
    // A trail nothing ever blocked would prove nothing about ordering inside the resolver.
    expect(blocked).toBe(true);
    return trail;
  };

  expect(path(indexed, indexedCache)).toEqual(path(plain, plainCache));
});
