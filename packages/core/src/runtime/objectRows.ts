import type { SceneObject } from "../scene/objectStore";
import type { RuntimeObjectRow } from "./snapshot";

/**
 * Convert a live placed object into its persisted row — the bridge between `ctx.scene.object` and
 * `GameRuntimeSnapshot.server.objects`/`chunks[].objects`. Per-instance `state` is carried as
 * `flags`. Presentation overrides (`visual`, `animation`) are catalog- and authoring-resolved and
 * deliberately stay off the persisted row — put anything a command must own in `state`.
 *
 * @capability placed-object-rows a placed object's per-instance state and container contents convert to and from the persisted snapshot row a host stores
 */
export function toRuntimeObjectRow(object: SceneObject): RuntimeObjectRow {
  return {
    instanceId: object.instanceId,
    catalogId: object.catalogId,
    position: [object.position[0], object.position[1], object.position[2]],
    rotationY: object.rotationY,
    ...(object.parentSpace !== undefined ? { parentSpace: object.parentSpace } : {}),
    ...(object.state !== undefined ? { flags: object.state } : {}),
    ...(object.slots !== undefined ? { slots: object.slots } : {}),
  };
}

/**
 * Inverse of {@link toRuntimeObjectRow}: rebuild the live placed object a host persisted.
 *
 * @capability placed-object-rehydrate rebuild live placed objects, with their state and slot contents, from persisted snapshot rows
 */
export function fromRuntimeObjectRow(row: RuntimeObjectRow): SceneObject {
  return {
    instanceId: row.instanceId,
    catalogId: row.catalogId,
    position: [row.position[0], row.position[1], row.position[2]],
    rotationY: row.rotationY ?? 0,
    ...(row.parentSpace !== undefined ? { parentSpace: row.parentSpace } : {}),
    ...(row.flags !== undefined ? { state: row.flags } : {}),
    ...(row.slots !== undefined ? { slots: row.slots } : {}),
  };
}
