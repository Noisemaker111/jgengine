import { expect, test } from "bun:test";
import { defaultObjectColliders } from "../scene/colliders";
import type { EntityPosition } from "../scene/entityStore";
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
