import { describe, expect, test } from "bun:test";

import {
  advancePlayerMotion,
  constrainStepToAxis,
  createEmptyMovementKeys,
  createPlayerMotionState,
  MOVEMENT_TUNING,
  resolveMovementIntent,
  resolveObstacleStep,
  snapPositionToGrid,
  type CollisionObstacle,
  type PlayerMotionState,
} from "./movementModel";

const DT = 1 / 60;

function jumpIntent() {
  const keys = createEmptyMovementKeys();
  keys.space = true;
  return resolveMovementIntent(keys, true);
}

function idleIntent() {
  return resolveMovementIntent(createEmptyMovementKeys(), true);
}

function runJumpArc(motion: PlayerMotionState, frames: number, tuning?: Parameters<typeof advancePlayerMotion>[6]) {
  const offsets: number[] = [];
  advancePlayerMotion(motion, jumpIntent(), 0, -1, 2.5, DT, tuning);
  for (let frame = 1; frame < frames; frame += 1) {
    advancePlayerMotion(motion, idleIntent(), 0, -1, 2.5, DT, tuning);
    offsets.push(motion.jumpOffset);
  }
  return offsets;
}

describe("advancePlayerMotion gravity/jump tuning", () => {
  test("default tuning matches MOVEMENT_TUNING constants", () => {
    const motion = createPlayerMotionState();
    advancePlayerMotion(motion, jumpIntent(), 0, -1, 2.5, DT);
    expect(motion.verticalVelocity).toBeCloseTo(MOVEMENT_TUNING.jumpVelocity - MOVEMENT_TUNING.gravityAcceleration * DT, 5);
  });

  test("a stronger jumpVelocity override reaches a higher peak", () => {
    const defaultMotion = createPlayerMotionState();
    const defaultOffsets = runJumpArc(defaultMotion, 90);
    const defaultPeak = Math.max(...defaultOffsets);

    const boostedMotion = createPlayerMotionState();
    const boostedOffsets = runJumpArc(boostedMotion, 90, { jumpVelocity: MOVEMENT_TUNING.jumpVelocity * 2 });
    const boostedPeak = Math.max(...boostedOffsets);

    expect(boostedPeak).toBeGreaterThan(defaultPeak);
  });

  test("heavier gravity override brings the jump down faster", () => {
    const defaultMotion = createPlayerMotionState();
    const defaultOffsets = runJumpArc(defaultMotion, 120);
    const defaultLandingFrame = defaultOffsets.findIndex((offset) => offset <= 0);

    const heavyMotion = createPlayerMotionState();
    const heavyOffsets = runJumpArc(heavyMotion, 120, { gravityAcceleration: MOVEMENT_TUNING.gravityAcceleration * 3 });
    const heavyLandingFrame = heavyOffsets.findIndex((offset) => offset <= 0);

    expect(heavyLandingFrame).toBeGreaterThan(0);
    expect(heavyLandingFrame).toBeLessThan(defaultLandingFrame);
  });

  test("omitted tuning fields fall back to MOVEMENT_TUNING defaults", () => {
    const plain = createPlayerMotionState();
    const tuned = createPlayerMotionState();
    advancePlayerMotion(plain, jumpIntent(), 0, -1, 2.5, DT);
    advancePlayerMotion(tuned, jumpIntent(), 0, -1, 2.5, DT, {});
    expect(tuned.verticalVelocity).toBeCloseTo(plain.verticalVelocity, 10);
  });
});

describe("resolveObstacleStep", () => {
  test("empty obstacles pass the step through unchanged", () => {
    const result = resolveObstacleStep([0, 0, 0], 0.5, 0.3, []);
    expect(result).toEqual({ stepX: 0.5, stepZ: 0.3 });
  });

  test("walking into a wall stops X but keeps the Z slide", () => {
    const obstacles: CollisionObstacle[] = [{ position: [1, 0, 0] }];
    const result = resolveObstacleStep([0, 0, 0], 0.5, 0.3, obstacles);
    expect(result.stepX).toBeCloseTo(0.2, 10);
    expect(result.stepZ).toBeCloseTo(0.3, 10);
  });

  test("approaching a corner slides along X then is blocked in Z", () => {
    const obstacles: CollisionObstacle[] = [{ position: [0, 0, 0] }];
    const result = resolveObstacleStep([-1.5, 0, -1.5], 1, 1, obstacles);
    expect(result.stepX).toBeCloseTo(1, 10);
    expect(result.stepZ).toBeCloseTo(0.7, 10);
  });

  test("an obstacle whose vertical span misses the player is ignored", () => {
    const obstacles: CollisionObstacle[] = [{ position: [1, 3, 0] }];
    const result = resolveObstacleStep([0, 0, 0], 1, 0, obstacles);
    expect(result).toEqual({ stepX: 1, stepZ: 0 });
  });

  test("a custom playerRadius widens the effective obstacle", () => {
    const obstacles: CollisionObstacle[] = [{ position: [1, 0, 0] }];
    const tight = resolveObstacleStep([0, 0, 0], 0.5, 0, obstacles, 0.1);
    const wide = resolveObstacleStep([0, 0, 0], 0.5, 0, obstacles, 0.4);
    expect(wide.stepX).toBeLessThan(tight.stepX);
  });

  test("custom halfExtents are respected", () => {
    const obstacles: CollisionObstacle[] = [{ position: [1, 0, 0], halfExtents: [1, 0.5, 0.5] }];
    const result = resolveObstacleStep([-0.5, 0, 0], 0.5, 0, obstacles);
    expect(result.stepX).toBeCloseTo(0.2, 10);
  });
});

describe("constrainStepToAxis", () => {
  test("axis x zeroes the Z component", () => {
    expect(constrainStepToAxis(0.4, 0.7, "x")).toEqual({ stepX: 0.4, stepZ: 0 });
  });

  test("axis z zeroes the X component", () => {
    expect(constrainStepToAxis(0.4, 0.7, "z")).toEqual({ stepX: 0, stepZ: 0.7 });
  });
});

describe("snapPositionToGrid", () => {
  test("snaps to the containing cell's center for a unit cell size", () => {
    expect(snapPositionToGrid(1.2, 1.9, 1)).toEqual([1.5, 1.5]);
  });

  test("matches navGrid's floor + half-cell center convention", () => {
    const cellSize = 2;
    expect(snapPositionToGrid(3, 3, cellSize)).toEqual([3, 3]);
    expect(snapPositionToGrid(2.1, -0.1, cellSize)).toEqual([3, -1]);
  });

  test("negative coordinates snap to the correct cell", () => {
    expect(snapPositionToGrid(-0.1, -2.1, 1)).toEqual([-0.5, -2.5]);
  });
});
