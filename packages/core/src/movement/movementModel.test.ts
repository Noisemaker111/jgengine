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

function forwardIntent() {
  const keys = createEmptyMovementKeys();
  keys.w = true;
  return resolveMovementIntent(keys, true);
}

function backIntent() {
  const keys = createEmptyMovementKeys();
  keys.s = true;
  return resolveMovementIntent(keys, true);
}

function steadySpeed(
  intent: ReturnType<typeof forwardIntent>,
  tuning?: Parameters<typeof advancePlayerMotion>[6],
  options?: Parameters<typeof advancePlayerMotion>[7],
): number {
  const motion = createPlayerMotionState();
  for (let frame = 0; frame < 300; frame += 1) {
    advancePlayerMotion(motion, intent, 0, -1, 2.5, DT, tuning, options);
  }
  return Math.hypot(motion.horizontalVelocityX, motion.horizontalVelocityZ);
}

describe("resolveTargetSpeed backpedal / speed scale", () => {
  const fullWalk = 2.5 * MOVEMENT_TUNING.walkSpeedMultiplier;

  test("forward (unset knobs) reaches exactly the prior walk speed", () => {
    expect(steadySpeed(forwardIntent())).toBeCloseTo(fullWalk, 4);
  });

  test("backpedal caps forward-key-negative travel at 0.65x", () => {
    expect(steadySpeed(backIntent()) / steadySpeed(forwardIntent())).toBeCloseTo(
      MOVEMENT_TUNING.backpedalSpeedMultiplier,
      5,
    );
  });

  test("backpedalSpeedMultiplier override replaces the default factor", () => {
    expect(steadySpeed(backIntent(), { backpedalSpeedMultiplier: 0.4 }) / fullWalk).toBeCloseTo(0.4, 5);
  });

  test("speedScale option scales the target speed", () => {
    expect(steadySpeed(forwardIntent(), undefined, { speedScale: 0.5 })).toBeCloseTo(fullWalk * 0.5, 4);
  });

  test("floating suppresses the jump launch and gravity", () => {
    const motion = createPlayerMotionState();
    advancePlayerMotion(motion, jumpIntent(), 0, -1, 2.5, DT, undefined, { floating: true });
    expect(motion.jumpOffset).toBe(0);
    expect(motion.verticalVelocity).toBe(0);
    expect(motion.grounded).toBe(true);
  });
});

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

  test("offset shifts the single-AABB obstacle center", () => {
    // Box half [0.5] centered at position+offset = x=1; a step from x=0 stops short of x≈0.2.
    const obstacles: CollisionObstacle[] = [{ position: [0, 0, 0], offset: [1, 0, 0], halfExtents: [0.5, 0.5, 0.5] }];
    const result = resolveObstacleStep([0, 0, 0], 0.5, 0, obstacles);
    expect(result.stepX).toBeCloseTo(0.2, 10);
  });

  test("a compound-boxes obstacle passes a step through the gap but blocks on a pillar sub-box", () => {
    // Two pillars in X leaving an open central gap x∈(-0.5, 0.5); thin in Z (a wall face).
    const obstacles: CollisionObstacle[] = [
      {
        position: [0, 0, 0],
        boxes: [
          { min: [-2, 0, -0.1], max: [-0.5, 3, 0.1] },
          { min: [0.5, 0, -0.1], max: [2, 3, 0.1] },
        ],
      },
    ];
    // Walking +Z through the gap (x=0): unobstructed.
    const throughGap = resolveObstacleStep([0, 0, -1], 0, 0.5, obstacles);
    expect(throughGap.stepZ).toBeCloseTo(0.5, 10);
    // Walking +Z into the right pillar (x=1.2): the Z step is stopped ≈playerRadius before the wall face.
    const intoPillar = resolveObstacleStep([1.2, 0, -0.5], 0, 0.5, obstacles);
    expect(intoPillar.stepZ).toBeLessThan(0.5);
    expect(intoPillar.stepZ).toBeCloseTo(0.1, 10); // reaches z=-0.4 (face -0.1 minus radius 0.3)
  });

  test("a sub-box entirely above the head lets the capsule walk under it (lintel)", () => {
    const obstacles: CollisionObstacle[] = [
      { position: [0, 0, 0], boxes: [{ min: [-2, 3, -0.1], max: [2, 4, 0.1] }] },
    ];
    // Player feet y=0, head y=1.8; the lintel sub-box at y[3,4] is skipped entirely.
    const result = resolveObstacleStep([0, 0, -1], 0, 0.5, obstacles);
    expect(result.stepZ).toBeCloseTo(0.5, 10);
  });

  test("a wide wall obstacle blocks across its true multi-metre span, not one metre", () => {
    // A 4m-wide wall (half-extent 2 in X); the default 0.5 box would leave x=1.5 clear.
    const wall: CollisionObstacle[] = [{ position: [0, 0, 0], halfExtents: [2, 1.5, 0.5] }];
    const blocked = resolveObstacleStep([1.5, 0, -1], 0, 0.5, wall);
    expect(blocked.stepZ).toBeLessThan(0.5);
    // Sanity: the same off-centre approach against a default unit box passes freely.
    const narrow: CollisionObstacle[] = [{ position: [0, 0, 0] }];
    expect(resolveObstacleStep([1.5, 0, -1], 0, 0.5, narrow).stepZ).toBeCloseTo(0.5, 10);
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
