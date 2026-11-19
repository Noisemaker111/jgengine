import type { EntityRole, EntityUpdatePatch, SpawnPositionInput } from "./entityStore";

/**
 * One sim body's per-tick pose, as the game's simulation computed it — the shape a game already builds
 * to hand to `setPose`, just declared instead of imperatively pushed. `kind` is the entity catalog name
 * used only the first time `id` is seen (a respawn/despawn never re-reads it).
 */
export interface BodySnapshot {
  id: string;
  kind: string;
  position: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  role?: EntityRole | undefined;
  meta?: unknown;
}

export interface BodyBindSpawnInput {
  id: string;
  position: SpawnPositionInput;
  rotationY?: number | undefined;
  rotationX?: number | undefined;
  rotationZ?: number | undefined;
  role?: EntityRole | undefined;
  meta?: unknown;
}

export interface BodyBindPose {
  position: SpawnPositionInput;
  rotationY?: number | undefined;
  rotationX?: number | undefined;
  rotationZ?: number | undefined;
  dt?: number | undefined;
}

export interface BodyBindDeps {
  has(id: string): boolean;
  spawn(kind: string, options: BodyBindSpawnInput): string;
  despawn(id: string): boolean;
  setPose(id: string, pose: BodyBindPose): boolean;
  update(id: string, patch: EntityUpdatePatch): boolean;
}

export interface BodyPlacement {
  position: readonly [number, number, number];
  rotationY?: number;
}

export type BodyTeleportHandler = (id: string, placement: BodyPlacement) => boolean;

export interface BodyBind {
  sync(bodies: Iterable<BodySnapshot>, dt?: number): void;
  boundIds(): ReadonlySet<string>;
  /**
   * The sim's answer to a placement from outside it (`teleportPlayer`, the agent bridge's `teleport`): the
   * next `sync` would put a moved body back where the sim has it, so a bound body only moves when its sim
   * moves. Without a handler such a placement is refused. `null` clears it.
   */
  onTeleport(handler: BodyTeleportHandler | null): void;
  teleport(id: string, placement: BodyPlacement): boolean;
}

/** @capability body-bind mirror sim-body snapshots onto scene entities each tick, no per-body setPose */
export function createBodyBind(deps: BodyBindDeps): BodyBind {
  const bound = new Set<string>();
  // The sync each bound id was last seen in: an id whose stamp is behind the current sync was dropped.
  // A stamp per id instead of a fresh "seen" set, and one pose and patch object refilled per body, so a
  // sync of hundreds of bodies a tick allocates nothing of its own (the deps read them and keep nothing).
  const seenAt = new Map<string, number>();
  let stamp = 0;
  const pose: BodyBindPose = { position: [0, 0, 0] };
  const patch: { role?: EntityRole | undefined; meta?: unknown } = {};
  let teleportHandler: BodyTeleportHandler | null = null;

  return {
    sync(bodies, dt) {
      stamp += 1;
      for (const body of bodies) {
        seenAt.set(body.id, stamp);
        const alreadyBound = bound.has(body.id);
        if (!alreadyBound && !deps.has(body.id)) {
          deps.spawn(body.kind, {
            id: body.id,
            position: body.position,
            rotationY: body.rotationY,
            rotationX: body.rotationX,
            rotationZ: body.rotationZ,
            role: body.role,
            meta: body.meta,
          });
        } else {
          pose.position = body.position;
          pose.rotationY = body.rotationY;
          pose.rotationX = body.rotationX;
          pose.rotationZ = body.rotationZ;
          pose.dt = dt;
          deps.setPose(body.id, pose);
          if (body.role !== undefined || body.meta !== undefined) {
            patch.role = body.role;
            patch.meta = body.meta;
            // An undefined field is "leave as is" to the store, the same as one left out.
            deps.update(body.id, patch as EntityUpdatePatch);
          }
        }
        bound.add(body.id);
      }
      for (const id of bound) {
        if (seenAt.get(id) === stamp) continue;
        deps.despawn(id);
        bound.delete(id);
        seenAt.delete(id);
      }
    },
    boundIds() {
      return bound;
    },
    onTeleport(handler) {
      teleportHandler = handler;
    },
    teleport(id, placement) {
      return bound.has(id) && teleportHandler !== null && teleportHandler(id, placement);
    },
  };
}
