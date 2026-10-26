import {
  buildContextMenu,
  type ContextMenu,
} from "@jgengine/core/interaction/contextMenu";
import { aimToPoint } from "@jgengine/core/input/pointer";
import { eyeHeightFromColliders } from "@jgengine/core/combat/shotOrigin";
import type { Aim } from "@jgengine/core/scene/spatial";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { PointerService } from "./pointerService.draw";

/** Minimal playable slice for context-menu verb lookup. @internal */
export type PointerPlayable = {
  content: {
    entityById?: (name: string) => { verbs?: ContextMenu["verbs"] } | null | undefined;
  };
};

/** How far a cursor aim reaches when the cursor is over open sky. */
const CURSOR_AIM_REACH_M = 250;

/**
 * Aim from the possessed/local player eye toward what is under the cursor. The cursor ray is tested
 * against the game's collision world (entities, objects, walls, terrain) rather than every drawn
 * triangle, so aiming costs a spatial query instead of a full-scene raycast on each shot; over open
 * sky the aim goes along the cursor ray. @internal
 */
export function pointerAimFor(ctx: GameContext, service: PointerService): Aim | undefined {
  const shooter =
    ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId)) ??
    ctx.scene.entity.get(ctx.player.userId);
  if (shooter === null) return undefined;
  const eye = eyeHeightFromColliders(ctx.scene.entity.collidersOf(shooter.id));
  const from: [number, number, number] = [shooter.position[0], shooter.position[1] + eye, shooter.position[2]];
  const ray = service.cursorRay();
  if (ray === null) {
    const hit = service.worldHit();
    return hit === null ? undefined : aimToPoint(from, hit.point);
  }
  const hit = ctx.scene.raycast({
    origin: ray.origin,
    direction: ray.direction,
    maxDistance: CURSOR_AIM_REACH_M,
    excludeInstanceIds: [shooter.id],
  });
  const reach = hit?.distance ?? CURSOR_AIM_REACH_M;
  const point: readonly [number, number, number] = hit?.point ?? [
    ray.origin[0] + ray.direction[0] * reach,
    ray.origin[1] + ray.direction[1] * reach,
    ray.origin[2] + ray.direction[2] * reach,
  ];
  return aimToPoint(from, point);
}

/** Camera rigs that show a free cursor over a world seen from outside the shooter. */
const CURSOR_AIM_RIGS: ReadonlySet<string> = new Set(["chase", "orbit", "topDown", "rts", "sideScroll"]);

/**
 * Whether shots and abilities aim at the cursor's world point. `pointer.aim` decides when a game
 * sets it; otherwise a rig that looks at the shooter from outside (chase, orbit, top-down, RTS,
 * side view) aims at the cursor, and first-person and shoulder rigs keep the crosshair. At runtime
 * a locked pointer always falls back to the crosshair (see {@link FrameDriver}).
 * @internal
 */
export function resolvePointerAim(pointerAim: boolean | undefined, rig: string | undefined): boolean {
  if (pointerAim !== undefined) return pointerAim;
  return CURSOR_AIM_RIGS.has(rig ?? "orbit");
}

/** Context menu for an entity/object pointer hit, or null for empty ground. @internal */
export function pointerContextMenu(
  ctx: GameContext,
  playable: PointerPlayable,
  hit: { point: readonly [number, number, number]; entity: string | null; object: string | null },
): ContextMenu | null {
  if (hit.entity !== null) {
    const entity = ctx.scene.entity.get(hit.entity);
    const verbs = entity === null ? undefined : playable.content.entityById?.(entity.name)?.verbs;
    return buildContextMenu({ kind: "entity", targetId: hit.entity, verbs, point: hit.point });
  }
  if (hit.object !== null) {
    const verbs = ctx.scene.object.catalog(hit.object)?.verbs;
    return buildContextMenu({ kind: "object", targetId: hit.object, verbs, point: hit.point });
  }
  return null;
}
