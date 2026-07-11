import { describe, expect, test } from "bun:test";

import { applyHorizontalImpulses, createMotionIntents } from "./motionIntents";

describe("createMotionIntents", () => {
  test("takePending is null when nothing is pending", () => {
    const motion = createMotionIntents();
    expect(motion.takePending()).toBeNull();
  });

  test("multiple impulses in one frame accumulate in call order", () => {
    const motion = createMotionIntents();
    motion.impulse(5);
    motion.impulse(3);
    motion.impulse(-1);
    expect(motion.takePending()).toEqual({
      impulses: [5, 3, -1],
      horizontalImpulses: [],
      verticalVelocity: null,
      y: null,
    });
  });

  test("setVerticalVelocity is last-write-wins", () => {
    const motion = createMotionIntents();
    motion.setVerticalVelocity(2);
    motion.setVerticalVelocity(9);
    expect(motion.takePending()).toEqual({
      impulses: [],
      horizontalImpulses: [],
      verticalVelocity: 9,
      y: null,
    });
  });

  test("setY is last-write-wins", () => {
    const motion = createMotionIntents();
    motion.setY(1);
    motion.setY(4);
    expect(motion.takePending()).toEqual({
      impulses: [],
      horizontalImpulses: [],
      verticalVelocity: null,
      y: 4,
    });
  });

  test("impulses, setVerticalVelocity, and setY combine in a single batch", () => {
    const motion = createMotionIntents();
    motion.impulse(1);
    motion.setVerticalVelocity(6);
    motion.setY(10);
    motion.impulse(2);
    expect(motion.takePending()).toEqual({
      impulses: [1, 2],
      horizontalImpulses: [],
      verticalVelocity: 6,
      y: 10,
    });
  });

  test("pushHorizontal batches [x, z] pairs in call order", () => {
    const motion = createMotionIntents();
    motion.pushHorizontal(1, 2);
    motion.pushHorizontal(-3, 4);
    expect(motion.takePending()).toEqual({
      impulses: [],
      horizontalImpulses: [
        [1, 2],
        [-3, 4],
      ],
      verticalVelocity: null,
      y: null,
    });
  });

  test("takePending clears the batch so the next call is null", () => {
    const motion = createMotionIntents();
    motion.impulse(1);
    motion.setVerticalVelocity(1);
    motion.setY(1);
    motion.takePending();
    expect(motion.takePending()).toBeNull();
  });
});

describe("applyHorizontalImpulses", () => {
  test("sums horizontal impulses onto a velocity pair", () => {
    const motion = createMotionIntents();
    motion.pushHorizontal(1, 2);
    motion.pushHorizontal(3, -1);
    const batch = motion.takePending();
    expect(applyHorizontalImpulses(10, 20, batch)).toEqual([14, 21]);
  });

  test("returns the input unchanged for a null batch", () => {
    expect(applyHorizontalImpulses(5, 6, null)).toEqual([5, 6]);
  });

  test("returns the input unchanged for a batch with an empty horizontalImpulses list", () => {
    const motion = createMotionIntents();
    motion.impulse(1);
    const batch = motion.takePending();
    expect(applyHorizontalImpulses(5, 6, batch)).toEqual([5, 6]);
  });
});
