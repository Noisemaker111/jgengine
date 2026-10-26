import type { GameContext } from "@jgengine/core/runtime/gameContext";

/** A model's measured local box (entity/object frame, Y up), as the renderer mounted it. */
export interface RenderBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** A Y-axis-centred sphere that wraps a {@link RenderBox} under any yaw. */
export interface RenderSphere {
  readonly radius: number;
  readonly offsetY: number;
}

type MeasuredBoxes = Record<"entity" | "object", Map<string, RenderBox>>;

const boxesByContext = new WeakMap<object, MeasuredBoxes>();
const sphereByBox = new WeakMap<RenderBox, RenderSphere>();

/**
 * Record what the renderer measured for one entity kind or object catalog id. Culling reads it, so a
 * model is hidden only once its real bounds are fully off-screen — whether or not the model also has
 * index dims for its colliders. @internal
 */
export function recordRenderBounds(ctx: GameContext, target: "entity" | "object", key: string, box: RenderBox): void {
  let boxes = boxesByContext.get(ctx);
  if (boxes === undefined) {
    boxes = { entity: new Map(), object: new Map() };
    boxesByContext.set(ctx, boxes);
  }
  const map = boxes[target];
  const previous = map.get(key);
  // Several instances of one kind can mount at different fits: keep the union so none is cut early.
  const merged: RenderBox = previous === undefined ? box : {
    min: [Math.min(previous.min[0], box.min[0]), Math.min(previous.min[1], box.min[1]), Math.min(previous.min[2], box.min[2])],
    max: [Math.max(previous.max[0], box.max[0]), Math.max(previous.max[1], box.max[1]), Math.max(previous.max[2], box.max[2])],
  };
  if (previous !== undefined && sameBox(previous, merged)) return;
  map.set(key, merged);
}

function sameBox(a: RenderBox, b: RenderBox): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    if (a.min[axis] !== b.min[axis] || a.max[axis] !== b.max[axis]) return false;
  }
  return true;
}

/** The measured box for one entity kind / object catalog id, or `undefined` before it mounts. @internal */
export function renderBoundsOf(ctx: GameContext, target: "entity" | "object", key: string): RenderBox | undefined {
  return boxesByContext.get(ctx)?.[target].get(key);
}

/**
 * The smallest sphere centred on the local Y axis that holds every corner of `box` under any rotation
 * about Y — the culling bound, so turning a long model never pokes it out of its sphere. @internal
 */
export function renderSphere(box: RenderBox): RenderSphere {
  const cached = sphereByBox.get(box);
  if (cached !== undefined) return cached;
  const offsetY = (box.min[1] + box.max[1]) / 2;
  const halfY = (box.max[1] - box.min[1]) / 2;
  let horizontal = 0;
  for (const x of [box.min[0], box.max[0]]) {
    for (const z of [box.min[2], box.max[2]]) horizontal = Math.max(horizontal, Math.hypot(x, z));
  }
  const sphere = { radius: Math.hypot(horizontal, halfY), offsetY };
  sphereByBox.set(box, sphere);
  return sphere;
}
