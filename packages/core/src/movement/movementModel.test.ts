import { describe, expect, test } from "bun:test";
import {
  advancePlayerMotion,
  createEmptyMovementKeys,
  createPlayerMotionState,
  resolveMovementIntent,
} from "@jgengine/core/movement/movementModel";

const IDLE = resolveMovementIntent(createEmptyMovementKeys(), true);

describe("advancePlayerMotion terrain grounding", () => {
  test("stays grounded on flat ground with no ground height", () => {
    const motion = createPlayerMotionState();
    for (let frame = 0; frame < 10; frame += 1) {
      advancePlayerMotion(motion, IDLE, 0, -1, 2, 1 / 60);
    }
    expect(motion.grounded).toBe(true);
    expect(motion.jumpOffset).toBe(0);
  });

  test("walking off a ledge falls under gravity", () => {
    const motion = createPlayerMotionState();
    motion.groundHeight = 6;
    advancePlayerMotion(motion, IDLE, 0, -1, 2, 1 / 60, 0);
    expect(motion.grounded).toBe(false);
    expect(motion.jumpOffset).toBeGreaterThan(5);
    const firstOffset = motion.jumpOffset;
    advancePlayerMotion(motion, IDLE, 0, -1, 2, 1 / 60, 0);
    expect(motion.jumpOffset).toBeLessThan(firstOffset);
    for (let frame = 0; frame < 120; frame += 1) {
      advancePlayerMotion(motion, IDLE, 0, -1, 2, 1 / 60, 0);
    }
    expect(motion.grounded).toBe(true);
    expect(motion.jumpOffset).toBe(0);
  });

  test("walking up a ramp steps up without leaving the ground", () => {
    const motion = createPlayerMotionState();
    let height = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      height += 0.05;
      advancePlayerMotion(motion, IDLE, 0, -1, 2, 1 / 60, height);
      expect(motion.grounded).toBe(true);
      expect(motion.jumpOffset).toBe(0);
    }
  });
});
