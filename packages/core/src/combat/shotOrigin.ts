import type { EntityPosition } from "../scene/entityStore";
import { worldOffset } from "../scene/colliders";
import type { Aim } from "../scene/spatial";

/**
 * How a shot's world-space origin (and optional direction) is resolved before prediction/settlement.
 * - `eye` — `aim.origin` when present, else the shooter's entity position raised to eye height; the
 *   shot traces the shooter's sightline, so what the crosshair covers is what gets hit (the default).
 * - `legacy` — `aim.origin` when present, else the shooter's raw entity position (feet).
 * - `entity` — always the shooter's entity position.
 * - `entityOffset` / `muzzle` — entity-local offset rotated by the shooter's yaw (muzzle on a weapon model).
 * - `camera` — explicit camera/reticle world origin (and optional direction override).
 * - `world` — absolute world origin.
 */
export type ShotOriginPolicy =
  | { kind: "eye"; height?: number }
  | { kind: "legacy" }
  | { kind: "entity" }
  | { kind: "entityOffset"; offset: EntityPosition }
  | { kind: "muzzle"; offset?: EntityPosition }
  | { kind: "camera"; origin: EntityPosition; direction?: EntityPosition }
  | { kind: "world"; origin: EntityPosition; direction?: EntityPosition };

export interface ResolvedShot {
  origin: EntityPosition;
  direction: EntityPosition;
}

export interface ShotOriginDeps {
  positionOf(instanceId: string): EntityPosition | undefined;
  rotationYOf?(instanceId: string): number | undefined;
}

const DEFAULT_MUZZLE_OFFSET: EntityPosition = [0, 1.4, 0.35];

/** Shot-origin and first-person camera eye height above an entity's position, in meters. */
export const DEFAULT_EYE_HEIGHT = 1.6;

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
    case "eye": {
      if ("origin" in aim) {
        if (aimDir === null) return null;
        return { origin: aim.origin, direction: aimDir };
      }
      const position = deps.positionOf(from);
      if (position === undefined || aimDir === null) return null;
      const height = policy.height ?? DEFAULT_EYE_HEIGHT;
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
