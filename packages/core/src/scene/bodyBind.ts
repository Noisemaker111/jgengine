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
  role?: EntityRole;
  meta?: unknown;
}

/** The options a {@link BodyBindDeps.spawn} call receives for an id seen for the first time. */
export interface BodyBindSpawnInput {
  id: string;
  position: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  role?: EntityRole;
  meta?: unknown;
}

/** The pose a {@link BodyBindDeps.setPose} call receives for an id already bound. */
export interface BodyBindPose {
  position: SpawnPositionInput;
  rotationY?: number;
  rotationX?: number;
  rotationZ?: number;
  dt?: number;
}

/** Structural entity-store seam a {@link BodyBind} mirrors onto — satisfied by `ctx.scene.entity` itself. */
export interface BodyBindDeps {
  has(id: string): boolean;
  spawn(kind: string, options: BodyBindSpawnInput): string;
  despawn(id: string): boolean;
  setPose(id: string, pose: BodyBindPose): boolean;
  update(id: string, patch: EntityUpdatePatch): boolean;
}

/** The lazily-keyed handle `ctx.scene.entity.bind(key)` returns. */
export interface BodyBind {
  /**
   * Mirror this tick's `bodies` onto scene entities: spawns an id seen for the first time (catalog
   * `kind` from its snapshot), poses one already bound, despawns one this bind previously spawned that
   * is now absent from `bodies`. `dt` (when given) derives `velocity` the same as a direct `setPose`.
   */
  sync(bodies: Iterable<BodySnapshot>, dt?: number): void;
  /** Ids this bind currently considers itself responsible for (spawned by, and not yet despawned by, `sync`). */
  boundIds(): ReadonlySet<string>;
}

/**
 * Mirror a sim's body snapshots onto scene entities each tick — spawn on first sight, pose while bound,
 * despawn on drop — replacing a per-body `setPose` loop plus its `despawn`/`spawn` respawn dance.
 *
 * @capability body-bind mirror sim-body snapshots onto scene entities each tick, no per-body setPose
 */
export function createBodyBind(deps: BodyBindDeps): BodyBind {
  const bound = new Set<string>();

  return {
    sync(bodies, dt) {
      const seen = new Set<string>();
      for (const body of bodies) {
        seen.add(body.id);
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
          deps.setPose(body.id, {
            position: body.position,
            rotationY: body.rotationY,
            rotationX: body.rotationX,
            rotationZ: body.rotationZ,
            ...(dt === undefined ? {} : { dt }),
          });
          if (body.role !== undefined || body.meta !== undefined) {
            deps.update(body.id, { role: body.role, meta: body.meta });
          }
        }
        bound.add(body.id);
      }
      for (const id of bound) {
        if (seen.has(id)) continue;
        deps.despawn(id);
        bound.delete(id);
      }
    },
    boundIds() {
      return bound;
    },
  };
}
