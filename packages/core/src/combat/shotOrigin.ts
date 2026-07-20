import type { EntityPosition } from "../scene/entityStore";
import { resolveColliders, worldOffset, type EntityColliderSet } from "../scene/colliders";
import type { Aim } from "../scene/spatial";

/**
 * How a shot's world-space origin (and optional direction) is resolved before prediction/settlement.
 * - `converge` — the shot leaves the gun `muzzle` yet still passes through whatever the shooter's
 *   sightline (crosshair) covers: origin is the muzzle offset, direction is bent from the muzzle to
 *   the eye ray's aim point. The projectile system's default for a free `{ yaw, pitch }` aim, so a
 *   bullet visibly comes from the barrel without missing the reticle. Needs a scene raycast to find
 *   the aim point (`convergeShot`); a bare `resolveShot` degrades to a straight muzzle ray. Passes an
 *   explicit `{ origin, direction }` aim through untouched.
 * - `eye` — `aim.origin` when present, else the shooter's entity position raised to eye height; the
 *   shot traces the shooter's sightline, so what the crosshair covers is what gets hit.
 * - `legacy` — `aim.origin` when present, else the shooter's raw entity position (feet).
 * - `entity` — always the shooter's entity position.
 * - `entityOffset` / `muzzle` — entity-local offset rotated by the shooter's yaw (muzzle on a weapon model).
 * - `camera` — explicit camera/reticle world origin (and optional direction override).
 * - `world` — absolute world origin.
 */
export type ShotOriginPolicy =
  | { kind: "converge"; muzzle?: EntityPosition; height?: number }
  | { kind: "eye"; height?: number }
  | { kind: "legacy" }
  | { kind: "entity" }
  | { kind: "entityOffset"; offset: EntityPosition }
  | { kind: "muzzle"; offset?: EntityPosition }
  | { kind: "camera"; origin: EntityPosition; direction?: EntityPosition }
  | { kind: "world"; origin: EntityPosition; direction?: EntityPosition };

/**
 * A shot's resolved firing geometry in world space: `origin` is the point the projectile/ray starts
 * from and `direction` is its normalized aim vector, both computed by {@link resolveShot} from the
 * shooter's position, facing, and the chosen origin policy.
 */
export interface ResolvedShot {
  origin: EntityPosition;
  direction: EntityPosition;
}

export interface ShotOriginDeps {
  positionOf(instanceId: string): EntityPosition | undefined;
  rotationYOf?(instanceId: string): number | undefined;
  /** When provided, the `eye` policy sizes its height from the shooter's own hitbox instead of the humanoid default. */
  collidersOf?(instanceId: string): EntityColliderSet | null | undefined;
}

const DEFAULT_MUZZLE_OFFSET: EntityPosition = [0, 1.4, 0.35];

const EYE_HEIGHT_RATIO = 0.9;

/** Shot-origin and first-person camera eye height above an entity's position: 90% of the default 1.8m hitbox top. */
export const DEFAULT_EYE_HEIGHT = EYE_HEIGHT_RATIO * 1.8;

/** Eye height derived from a collider set: 90% of the tallest hitbox top, or the humanoid default when unknown. */
export function eyeHeightFromColliders(set: EntityColliderSet | null | undefined): number {
  const colliders = resolveColliders(set);
  let top = 0;
  for (const collider of colliders) {
    const offsetY = collider.shape.offset?.[1] ?? 0;
    const halfHeight =
      collider.shape.kind === "sphere" ? collider.shape.radius : collider.shape.halfExtents[1];
    top = Math.max(top, offsetY + halfHeight);
  }
  return top > 0 ? top * EYE_HEIGHT_RATIO : DEFAULT_EYE_HEIGHT;
}

function normalize(vector: EntityPosition): EntityPosition | null {
  const length = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
  if (length === 0) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function aimDirection(aim: Aim): EntityPosition | null {
  if ("origin" in aim) return normalize(aim.direction);
  const cosPitch = Math.cos(aim.pitch);
  return [Math.sin(aim.yaw) * cosPitch, Math.sin(aim.pitch), Math.cos(aim.yaw) * cosPitch];
}

export function aimSpreadDeg(aim: Aim): number {
  return "origin" in aim ? 0 : aim.spread ?? 0;
}

export function resolveShot(
  deps: ShotOriginDeps,
  from: string,
  aim: Aim,
  policy: ShotOriginPolicy = { kind: "eye" },
): ResolvedShot | null {
  const aimDir = aimDirection(aim);
  if (aimDir === null && policy.kind !== "camera" && policy.kind !== "world") return null;

  switch (policy.kind) {
    case "converge": {
      if ("origin" in aim) {
        if (aimDir === null) return null;
        return { origin: aim.origin, direction: aimDir };
      }
      if (aimDir === null) return null;
      const muzzle = resolveShot(deps, from, aim, { kind: "muzzle", offset: policy.muzzle });
      return muzzle ?? null;
    }
    case "eye": {
      if ("origin" in aim) {
        if (aimDir === null) return null;
        return { origin: aim.origin, direction: aimDir };
      }
      const position = deps.positionOf(from);
      if (position === undefined || aimDir === null) return null;
      const height =
        policy.height ??
        (deps.collidersOf !== undefined
          ? eyeHeightFromColliders(deps.collidersOf(from))
          : DEFAULT_EYE_HEIGHT);
      return { origin: [position[0], position[1] + height, position[2]], direction: aimDir };
    }
    case "legacy": {
      const origin = "origin" in aim ? aim.origin : deps.positionOf(from);
      if (origin === undefined || aimDir === null) return null;
      return { origin, direction: aimDir };
    }
    case "entity": {
      const origin = deps.positionOf(from);
      if (origin === undefined || aimDir === null) return null;
      return { origin, direction: aimDir };
    }
    case "entityOffset":
    case "muzzle": {
      const position = deps.positionOf(from);
      if (position === undefined || aimDir === null) return null;
      const rotationY = deps.rotationYOf?.(from) ?? 0;
      const offset =
        policy.kind === "muzzle" ? (policy.offset ?? DEFAULT_MUZZLE_OFFSET) : policy.offset;
      return { origin: worldOffset(offset, position, rotationY), direction: aimDir };
    }
    case "camera": {
      const direction = policy.direction !== undefined ? normalize(policy.direction) : aimDir;
      if (direction === null) return null;
      return { origin: policy.origin, direction };
    }
    case "world": {
      const direction = policy.direction !== undefined ? normalize(policy.direction) : aimDir;
      if (direction === null) return null;
      return { origin: policy.origin, direction };
    }
  }
}

/**
 * Resolves a `converge` shot with scene knowledge: fires from the gun muzzle but bends the direction
 * so the shot passes through the aim point the shooter's eye ray covers. `sightHit` casts the eye ray
 * and returns where it lands (first impact), or `null` to fall back to a point `range` metres down the
 * sightline. A `{ origin, direction }` aim is passed through unchanged (nothing to converge).
 */
export function convergeShot(
  deps: ShotOriginDeps,
  from: string,
  aim: Aim,
  range: number,
  sightHit: (origin: EntityPosition, direction: EntityPosition) => EntityPosition | null,
  muzzleOffset?: EntityPosition,
): ResolvedShot | null {
  const sight = resolveShot(deps, from, aim, { kind: "eye", height: undefined });
  if (sight === null) return null;
  if ("origin" in aim) return sight;
  const muzzle = resolveShot(deps, from, aim, { kind: "muzzle", offset: muzzleOffset });
  if (muzzle === null) return sight;
  const aimPoint =
    sightHit(sight.origin, sight.direction) ??
    ([
      sight.origin[0] + sight.direction[0] * range,
      sight.origin[1] + sight.direction[1] * range,
      sight.origin[2] + sight.direction[2] * range,
    ] as EntityPosition);
  const direction = normalize([
    aimPoint[0] - muzzle.origin[0],
    aimPoint[1] - muzzle.origin[1],
    aimPoint[2] - muzzle.origin[2],
  ]);
  return { origin: muzzle.origin, direction: direction ?? muzzle.direction };
}
