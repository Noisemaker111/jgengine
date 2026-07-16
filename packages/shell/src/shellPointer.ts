import {
  buildContextMenu,
  type ContextMenu,
} from "@jgengine/core/interaction/contextMenu";
import { aimToPoint } from "@jgengine/core/input/pointer";
import { eyeHeightFromColliders } from "@jgengine/core/combat/shotOrigin";
import type { Aim } from "@jgengine/core/scene/spatial";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { PointerService } from "./pointer/pointerService";

/** Minimal playable slice for context-menu verb lookup. @internal */
export type PointerPlayable = {
  content: {
    entityById?: (name: string) => { verbs?: ContextMenu["verbs"] } | null | undefined;
  };
};

/** Aim from the possessed/local player eye toward the current pointer world hit. @internal */
export function pointerAimFor(ctx: GameContext, service: PointerService): Aim | undefined {
  const hit = service.worldHit();
  if (hit === null) return undefined;
  const shooter =
    ctx.scene.entity.get(ctx.player.possession.active(ctx.player.userId)) ??
    ctx.scene.entity.get(ctx.player.userId);
  if (shooter === null) return undefined;
  const eye = eyeHeightFromColliders(ctx.scene.entity.collidersOf(shooter.id));
  return aimToPoint(
    [shooter.position[0], shooter.position[1] + eye, shooter.position[2]],
    hit.point,
  );
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
