/**
 * Voxel character controller (pure model).
 *
 * The base first-person controller in `movementModel.ts` assumes flat ground at
 * y=0 — it integrates gravity into a `jumpOffset` and never asks the world how
 * tall the ground is. That is fine for a plaza demo but wrong for any game where
 * the player walks on placed blocks and digs down into the world: they float on
 * an invisible floor, clip through walls, and can never descend.
 *
 * This module resolves the player as an axis-aligned box against a set of solid
 * unit cells (a `SolidQuery`), so the same held-keys → intent pipeline drives a
 * body that stands on blocks, falls into holes, is stopped by walls, and steps
 * up single-block ledges. Keeping it renderer-free means the shell can drive it
 * from live scene objects while the descent/landing/step-up behaviour stays unit
 * testable without three.js.
 *
 * Cell convention matches the shell's object rendering and the voxel raycast:
 * cell (x,y,z) is the solid box X∈[x-0.5,x+0.5], Y∈[y,y+1], Z∈[z-0.5,z+0.5]. A
 * block at cell y therefore has its top face at world y+1, so a player standing
 * on the surface layer (cell y=-1) rests with their feet at y=0.
 */

import { MOVEMENT_TUNING, type MovementIntent, type MovementTuningOverrides } from "./movementModel";

export type SolidQuery = (x: number, y: number, z: number) => boolean;

/** Footprint + height of the player box, in world units. */
export interface VoxelPlayerDims {
  /** Half the box width on both horizontal axes. */
  halfWidth: number;
  /** Box height measured up from the feet. */
  height: number;
  /** Tallest ledge the player walks up without jumping. */
  stepHeight: number;
}

export const DEFAULT_VOXEL_DIMS: VoxelPlayerDims = {
  halfWidth: 0.3,
  height: 1.8,
  stepHeight: 0.6,
};

/** Mutable kinematic state carried between frames by the voxel controller. */
export interface VoxelPlayerBody {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  jumpHeld: boolean;
}

export function createVoxelPlayerBody(x: number, y: number, z: number): VoxelPlayerBody {
  return { x, y, z, velocityX: 0, velocityY: 0, velocityZ: 0, grounded: true, jumpHeld: false };
}

const SUPPORT_EPSILON = 0.02;
const PENETRATION_EPSILON = 1e-4;

function cellX(worldX: number): number {
  return Math.floor(worldX + 0.5);
}

function cellZ(worldZ: number): number {
  return Math.floor(worldZ + 0.5);
}

/** True if the player box centred at (x, y, z) overlaps any solid cell. */
function overlapsSolid(
  x: number,
  y: number,
  z: number,
  isSolid: SolidQuery,
  dims: VoxelPlayerDims,
): boolean {
  const minCellX = cellX(x - dims.halfWidth);
  const maxCellX = cellX(x + dims.halfWidth);
  const minCellZ = cellZ(z - dims.halfWidth);
  const maxCellZ = cellZ(z + dims.halfWidth);
  const minCellY = Math.floor(y + PENETRATION_EPSILON);
  const maxCellY = Math.floor(y + dims.height - PENETRATION_EPSILON);
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
      for (let cy = minCellY; cy <= maxCellY; cy += 1) {
        if (isSolid(cx, cy, cz)) return true;
      }
    }
  }
  return false;
}

/** True if a solid cell sits directly beneath the feet (i.e. the player is supported). */
function hasSupport(
  x: number,
  z: number,
  y: number,
  isSolid: SolidQuery,
  dims: VoxelPlayerDims,
): boolean {
  const cy = Math.floor(y - SUPPORT_EPSILON);
  const minCellX = cellX(x - dims.halfWidth);
  const maxCellX = cellX(x + dims.halfWidth);
  const minCellZ = cellZ(z - dims.halfWidth);
  const maxCellZ = cellZ(z + dims.halfWidth);
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
      if (isSolid(cx, cy, cz)) return true;
    }
  }
  return false;
}

/**
 * Highest solid-cell top under the footprint at (x, z) within the vertical
 * window [fromY, toY]. Returns null when nothing supports the feet there — used
 * both to snap a fall onto a block and to raise a step-up.
 */
function supportTopWithin(
  x: number,
  z: number,
  fromY: number,
  toY: number,
  isSolid: SolidQuery,
  dims: VoxelPlayerDims,
): number | null {
  const minCellX = cellX(x - dims.halfWidth);
  const maxCellX = cellX(x + dims.halfWidth);
  const minCellZ = cellZ(z - dims.halfWidth);
  const maxCellZ = cellZ(z + dims.halfWidth);
  const lowCellY = Math.floor(fromY - PENETRATION_EPSILON);
  const highCellY = Math.floor(toY - PENETRATION_EPSILON);
  let best: number | null = null;
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
      for (let cy = lowCellY; cy <= highCellY; cy += 1) {
        if (!isSolid(cx, cy, cz)) continue;
        const top = cy + 1;
        if (best === null || top > best) best = top;
      }
    }
  }
  return best;
}

function targetHorizontalVelocity(
  intent: MovementIntent,
  forwardX: number,
  forwardZ: number,
  baseSpeed: number,
): { x: number; z: number } {
  if (!intent.moving) return { x: 0, z: 0 };
  let fx = forwardX;
  let fz = forwardZ;
  const lengthSq = fx * fx + fz * fz;
  if (lengthSq < 1e-6) {
    fx = 0;
    fz = -1;
  } else {
    const inv = 1 / Math.sqrt(lengthSq);
    fx *= inv;
    fz *= inv;
  }
  const rightX = -fz;
  const rightZ = fx;
  let vx = fx * intent.forward + rightX * intent.right;
  let vz = fz * intent.forward + rightZ * intent.right;
  const magSq = vx * vx + vz * vz;
  if (magSq < 1e-6) return { x: 0, z: 0 };
  const speedMultiplier = intent.crouching
    ? MOVEMENT_TUNING.crouchSpeedMultiplier
    : intent.running
      ? MOVEMENT_TUNING.runSpeedMultiplier
      : 1;
  const targetSpeed = baseSpeed * MOVEMENT_TUNING.walkSpeedMultiplier * speedMultiplier;
  const scale = targetSpeed / Math.sqrt(magSq);
  vx *= scale;
  vz *= scale;
  return { x: vx, z: vz };
}

/**
 * Move the body along one horizontal axis, resolving collisions. Returns the
 * component of the step that survived (0 when a wall stopped the move). When the
 * move is blocked but the obstacle is a short ledge, the body steps up onto it.
 */
function moveAxis(
  body: VoxelPlayerBody,
  axis: "x" | "z",
  delta: number,
  isSolid: SolidQuery,
  dims: VoxelPlayerDims,
): number {
  if (delta === 0) return 0;
  const nextX = axis === "x" ? body.x + delta : body.x;
  const nextZ = axis === "z" ? body.z + delta : body.z;
  if (!overlapsSolid(nextX, body.y, nextZ, isSolid, dims)) {
    body.x = nextX;
    body.z = nextZ;
    return delta;
  }
  if (body.grounded) {
    const raised = supportTopWithin(nextX, nextZ, body.y, body.y + dims.stepHeight, isSolid, dims);
    if (
      raised !== null &&
      raised - body.y <= dims.stepHeight + PENETRATION_EPSILON &&
      raised >= body.y &&
      !overlapsSolid(nextX, raised, nextZ, isSolid, dims)
    ) {
      body.x = nextX;
      body.z = nextZ;
      body.y = raised;
      return delta;
    }
  }
  return 0;
}

/**
 * Advance one frame of voxel-collided player kinematics. Mutates `body`
 * (position, velocity, grounded) in place.
 *
 * `forwardX`/`forwardZ` are the camera heading projected onto the ground plane
 * (need not be normalized). Pulling this out of the render loop is what lets us
 * assert "dig the block underfoot and the player drops a level" in a unit test.
 */
export function advanceVoxelPlayer(
  body: VoxelPlayerBody,
  intent: MovementIntent,
  forwardX: number,
  forwardZ: number,
  baseSpeed: number,
  rawDeltaSeconds: number,
  isSolid: SolidQuery,
  dims: VoxelPlayerDims = DEFAULT_VOXEL_DIMS,
  tuning?: MovementTuningOverrides,
): void {
  const dt = Math.min(rawDeltaSeconds, MOVEMENT_TUNING.maxFrameSeconds);
  const gravityAcceleration = tuning?.gravityAcceleration ?? MOVEMENT_TUNING.gravityAcceleration;
  const jumpVelocity = tuning?.jumpVelocity ?? MOVEMENT_TUNING.jumpVelocity;

  const target = targetHorizontalVelocity(intent, forwardX, forwardZ, baseSpeed);
  const acceleration = body.grounded
    ? MOVEMENT_TUNING.groundAcceleration
    : MOVEMENT_TUNING.airAcceleration;
  const accelerationBlend = 1 - Math.exp(-acceleration * dt);
  body.velocityX += (target.x - body.velocityX) * accelerationBlend;
  body.velocityZ += (target.z - body.velocityZ) * accelerationBlend;
  if (!intent.moving && body.grounded) {
    const friction = Math.exp(-MOVEMENT_TUNING.groundFriction * dt);
    body.velocityX *= friction;
    body.velocityZ *= friction;
  }

  if (moveAxis(body, "x", body.velocityX * dt, isSolid, dims) === 0) body.velocityX = 0;
  if (moveAxis(body, "z", body.velocityZ * dt, isSolid, dims) === 0) body.velocityZ = 0;

  const supported = body.grounded && hasSupport(body.x, body.z, body.y, isSolid, dims);
  body.grounded = supported;

  const jumpPressed = intent.jumping;
  if (jumpPressed && !body.jumpHeld && body.grounded && !intent.crouching) {
    body.velocityY = jumpVelocity;
    body.grounded = false;
  }
  body.jumpHeld = jumpPressed;

  if (!body.grounded) {
    body.velocityY -= gravityAcceleration * dt;
    const nextY = body.y + body.velocityY * dt;
    if (body.velocityY <= 0) {
      if (overlapsSolid(body.x, nextY, body.z, isSolid, dims)) {
        const top = supportTopWithin(body.x, body.z, nextY, body.y + dims.height, isSolid, dims);
        body.y = top ?? Math.floor(body.y);
        body.velocityY = 0;
        body.grounded = true;
      } else {
        body.y = nextY;
      }
    } else if (overlapsSolid(body.x, nextY, body.z, isSolid, dims)) {
      body.velocityY = 0;
    } else {
      body.y = nextY;
    }
  }
}
