import { describe, expect, test } from "bun:test";

import {
  advancePlayerMotion,
  createEmptyMovementKeys,
  createPlayerMotionState,
  MOVEMENT_TUNING,
  resolveMovementIntent,
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
