import { describe, expect, test } from "bun:test";
import {
  advancePlayerMotion,
  createPlayerMotionState,
  MOVEMENT_TUNING,
  type MovementIntent,
} from "@jgengine/core/movement/movementModel";

const IDLE: MovementIntent = { forward: 0, right: 0, crouching: false, running: false, jumping: false, moving: false };
const JUMP: MovementIntent = { ...IDLE, jumping: true };

function runUntilGrounded(
  motion: ReturnType<typeof createPlayerMotionState>,
  intent: MovementIntent,
  dt: number,
  options?: Parameters<typeof advancePlayerMotion>[6],
  maxFrames = 200,
) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    advancePlayerMotion(motion, intent, 0, -1, 2, dt, options);
    if (motion.grounded) return frame + 1;
  }
  throw new Error("did not land within maxFrames");
}

describe("advancePlayerMotion", () => {
  test("flat-ground jump: first frame matches the legacy fixed constants exactly", () => {
    const motion = createPlayerMotionState();
    const step = advancePlayerMotion(motion, JUMP, 0, -1, 2, 0.05);
    expect(motion.verticalVelocity).toBeCloseTo(MOVEMENT_TUNING.jumpVelocity - MOVEMENT_TUNING.gravityAcceleration * 0.05);
    expect(step.y).toBeCloseTo(motion.verticalVelocity * 0.05);
    expect(motion.jumpOffset).toBeCloseTo(step.y);
    expect(motion.grounded).toBe(false);
  });

  test("flat-ground jump arc: rises then lands back at y=0, grounded, zero vertical velocity", () => {
    const motion = createPlayerMotionState();
    advancePlayerMotion(motion, JUMP, 0, -1, 2, 0.05);
    let peak = motion.y;
    let landedAt = -1;
    for (let frame = 0; frame < 200; frame += 1) {
      advancePlayerMotion(motion, IDLE, 0, -1, 2, 0.05);
      peak = Math.max(peak, motion.y);
      if (motion.grounded) {
        landedAt = frame;
        break;
      }
    }
    expect(landedAt).toBeGreaterThan(-1);
    expect(peak).toBeGreaterThan(0);
    expect(motion.y).toBeCloseTo(0);
    expect(motion.jumpOffset).toBeCloseTo(0);
    expect(motion.verticalVelocity).toBe(0);
  });

  test("raised platform: falling from above lands exactly at groundY, not 0", () => {
    const motion = createPlayerMotionState();
    motion.grounded = false;
    motion.y = 5;
    const frames = runUntilGrounded(motion, IDLE, 0.05, { groundY: 3 });
    expect(frames).toBeGreaterThan(0);
    expect(motion.y).toBeCloseTo(3);
    expect(motion.jumpOffset).toBeCloseTo(0);
    expect(motion.verticalVelocity).toBe(0);
  });

  test("ledge walk-off: grounded on a platform, then the ground drops away underfoot and the avatar falls", () => {
    const motion = createPlayerMotionState();
    motion.grounded = true;
    motion.y = 2;

    advancePlayerMotion(motion, IDLE, 0, -1, 2, 0.05, { groundY: 2 });
    expect(motion.grounded).toBe(true);
    expect(motion.y).toBeCloseTo(2);

    advancePlayerMotion(motion, IDLE, 0, -1, 2, 0.05, { groundY: 0 });
    expect(motion.grounded).toBe(false);
    expect(motion.y).toBeLessThan(2);

    const frames = runUntilGrounded(motion, IDLE, 0.05, { groundY: 0 });
    expect(frames).toBeGreaterThan(0);
    expect(motion.y).toBeCloseTo(0);
  });

  test("step-up: raising groundY under a grounded avatar snaps it up instead of falling", () => {
    const motion = createPlayerMotionState();
    motion.grounded = true;
    motion.y = 0;
    const step = advancePlayerMotion(motion, IDLE, 0, -1, 2, 0.05, { groundY: 1 });
    expect(motion.grounded).toBe(true);
    expect(motion.y).toBeCloseTo(1);
    expect(step.y).toBeCloseTo(1);
    expect(motion.jumpOffset).toBeCloseTo(0);
  });

  test("gravity and jumpVelocity overrides replace the tuning defaults", () => {
    const motion = createPlayerMotionState();
    const step = advancePlayerMotion(motion, JUMP, 0, -1, 2, 0.05, { gravity: 10, jumpVelocity: 5 });
    expect(motion.verticalVelocity).toBeCloseTo(5 - 10 * 0.05);
    expect(step.y).toBeCloseTo(motion.verticalVelocity * 0.05);
  });

  test("no options and y=0/groundY=0 keeps jumpOffset numerically identical to a bare y reading", () => {
    const motion = createPlayerMotionState();
    for (let frame = 0; frame < 5; frame += 1) {
      advancePlayerMotion(motion, frame === 0 ? JUMP : IDLE, 0, -1, 2, 0.05);
      expect(motion.jumpOffset).toBeCloseTo(motion.y);
    }
  });
});
