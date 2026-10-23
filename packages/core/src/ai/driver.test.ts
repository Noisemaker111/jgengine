import { describe, expect, test } from "bun:test";

import { difficultyProfile, type DifficultyProfile } from "./difficulty";
import {
  createDriverState,
  driveStep,
  paceBandFactor,
  pathTargetAhead,
  type DriverPose,
  type DriverTuning,
  type PaceBand,
} from "./driver";

const noRng = () => 0.5;
const TUNING: DriverTuning = { maxSpeed: 20 };

const exact = (overrides: Partial<DifficultyProfile> = {}): DifficultyProfile =>
  difficultyProfile("expert", { reactionSeconds: 0, decisionNoise: 0, executionJitter: 0, ...overrides });

const pose = (x: number, z: number, heading: number, speed: number): DriverPose => ({ x, z, heading, speed });

describe("driveStep steering and speed", () => {
  test("steers toward the target and throttles up from rest", () => {
    const state = createDriverState(0, 10);
    const step = driveStep(state, 0.1, pose(0, 0, 0, 0), { x: 0, z: 10 }, exact(), TUNING, noRng);
    expect(step.steer).toBe(0);
    expect(step.throttle).toBeGreaterThan(0);
    expect(step.brake).toBe(0);
  });

  test("steer sign follows the heading error", () => {
    const state = createDriverState(10, 0);
    // Target due +x while heading +z: error is +π/2, steer hard right (positive).
    const right = driveStep(state, 0.1, pose(0, 0, 0, 5), { x: 10, z: 0 }, exact(), TUNING, noRng);
    expect(right.steer).toBe(1);
    const state2 = createDriverState(-10, 0);
    const left = driveStep(state2, 0.1, pose(0, 0, 0, 5), { x: -10, z: 0 }, exact(), TUNING, noRng);
    expect(left.steer).toBe(-1);
  });

  test("sheds speed into a hard corner instead of full throttle", () => {
    const state = createDriverState(10, 0);
    // Right-angle error at full maxSpeed: default cornerSlowdown 0.75 → desired 5, so brake.
    const step = driveStep(state, 0.1, pose(0, 0, 0, 20), { x: 10, z: 0 }, exact(), TUNING, noRng);
    expect(step.brake).toBeGreaterThan(0);
    expect(step.throttle).toBe(0);
  });

  test("straight-line cruise holds near maxSpeed without braking", () => {
    const state = createDriverState(0, 100);
    const step = driveStep(state, 0.1, pose(0, 0, 0, 20), { x: 0, z: 100 }, exact(), TUNING, noRng);
    expect(step.brake).toBe(0);
    expect(step.throttle).toBe(0);
  });
});

describe("reaction delay-line", () => {
  test("an easy driver steers at where the goal was, not where it is", () => {
    const profile = exact({ reactionSeconds: 0.9 });
    const state = createDriverState(0, 50);
    // First step samples the goal at [0, 50], then the goal jumps right.
    driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 50 }, profile, TUNING, noRng);
    const stale = driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 40, z: 0 }, profile, TUNING, noRng);
    expect(stale.steer).toBe(0);
    expect(state.targetX).toBe(0);
    // After the reaction time elapses the new goal is finally sampled.
    driveStep(state, 0.9, pose(0, 0, 0, 10), { x: 40, z: 0 }, profile, TUNING, noRng);
    expect(state.targetX).toBe(40);
  });

  test("zero reaction tracks the live goal every step", () => {
    const state = createDriverState(0, 0);
    driveStep(state, 0.016, pose(0, 0, 0, 10), { x: 7, z: 30 }, exact(), TUNING, noRng);
    expect(state.targetX).toBe(7);
    driveStep(state, 0.016, pose(0, 0, 0, 10), { x: 9, z: 30 }, exact(), TUNING, noRng);
    expect(state.targetX).toBe(9);
  });
});

describe("steering jitter", () => {
  test("jitter bends the wheel and is resampled on the interval, not per frame", () => {
    const profile = exact({ executionJitter: 0.5 });
    let draws = 0;
    const rng = () => {
      draws += 1;
      return 1;
    };
    const state = createDriverState(0, 100);
    const first = driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, profile, TUNING, rng);
    expect(first.steer).toBeGreaterThan(0);
    driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, profile, TUNING, rng);
    driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, profile, TUNING, rng);
    expect(draws).toBe(1);
    driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, profile, TUNING, rng);
    driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, profile, TUNING, rng);
    expect(draws).toBe(2);
  });

  test("a clean profile never bends the wheel", () => {
    const state = createDriverState(0, 100);
    const step = driveStep(state, 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, exact(), TUNING, noRng);
    expect(step.steer).toBe(0);
  });
});

describe("obstacle braking", () => {
  test("expert brakes on true clearance; easy perceives it late", () => {
    const sharp = exact();
    const dull = exact({ reactionSeconds: 0.9 });
    const clearance = 10;
    // At speed 6 with default margin 6: the dull driver perceives 10 - 6*0.9 = 4.6 <= 6 and slams
    // the brakes; the sharp driver perceives the true 10 and only eases off in the slow zone.
    const dullStep = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 6), { x: 0, z: 100 }, dull, TUNING, noRng, clearance);
    expect(dullStep.brake).toBe(1);
    const sharpStep = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 6), { x: 0, z: 100 }, sharp, TUNING, noRng, clearance);
    expect(sharpStep.brake).toBeLessThan(1);
    expect(sharpStep.brake).toBeGreaterThan(0);
  });

  test("inside the margin everyone slams the brakes", () => {
    const step = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, exact(), TUNING, noRng, 4);
    expect(step.brake).toBe(1);
    expect(step.throttle).toBe(0);
  });

  test("clear road ignores the obstacle input", () => {
    const step = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 10), { x: 0, z: 100 }, exact(), TUNING, noRng, null);
    expect(step.brake).toBe(0);
  });
});

describe("arrival", () => {
  test("stopAtGoal brakes to a halt inside the radius", () => {
    const state = createDriverState(0, 2);
    const step = driveStep(state, 0.1, pose(0, 0, 0, 6), { x: 0, z: 2, stopAtGoal: true }, exact(), TUNING, noRng);
    expect(step.arrived).toBe(true);
    expect(step.brake).toBeGreaterThan(0);
    expect(step.throttle).toBe(0);
  });

  test("a drive-through goal reports arrival but keeps rolling", () => {
    const state = createDriverState(0, 2);
    const step = driveStep(state, 0.1, pose(0, 0, 0, 6), { x: 0, z: 2 }, exact(), TUNING, noRng);
    expect(step.arrived).toBe(true);
    expect(step.brake + step.throttle).toBeGreaterThanOrEqual(0);
  });
});

describe("stuck-reverse recovery", () => {
  test("grinding against a wall flips into a counter-steer reverse, then resumes", () => {
    const profile = exact();
    const state = createDriverState(30, 0);
    const wall = pose(0, 0, 0, 0); // throttling toward +x target but pinned at rest, heading +z
    let step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, profile, TUNING, noRng);
    expect(step.throttle).toBeGreaterThan(0.3);
    for (let i = 0; i < 3; i += 1) step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, profile, TUNING, noRng);
    // 2.0s of grinding > stuckSeconds 1.5 + reaction 0 → now reversing with counter-steer.
    expect(step.brake).toBe(1);
    expect(step.throttle).toBe(0);
    expect(step.steer).toBe(-1); // target to the right → back up steering left, nose swings right
    // Reverse window expires and forward driving resumes.
    for (let i = 0; i < 3; i += 1) step = driveStep(state, 0.5, pose(0, -3, 0, -2), { x: 30, z: 0 }, profile, TUNING, noRng);
    expect(step.throttle).toBeGreaterThan(0);
  });

  test("a slow reactor grinds longer before backing out", () => {
    const dull = exact({ reactionSeconds: 0.9 });
    const state = createDriverState(30, 0);
    const wall = pose(0, 0, 0, 0);
    let step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, dull, TUNING, noRng);
    for (let i = 0; i < 3; i += 1) step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, dull, TUNING, noRng);
    // 2.0s < 1.5 + 0.9 → still grinding forward, not yet reversing.
    expect(step.throttle).toBeGreaterThan(0);
    step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, dull, TUNING, noRng); // crosses 2.4s, arms reverse
    step = driveStep(state, 0.5, wall, { x: 30, z: 0 }, dull, TUNING, noRng);
    expect(step.brake).toBe(1);
  });
});

describe("pace band", () => {
  const BAND: PaceBand = { margin: 0, tolerance: 2, easeAt: 10, ease: 0.25, pushAt: 20, push: 0.5 };
  const CRUISE: DriverTuning = { maxSpeed: 30 };

  test("the tolerance is a dead zone: inside it the rule and the step change nothing", () => {
    for (const gap of [-2, -1, 0, 1, 2]) expect(paceBandFactor(BAND, gap)).toBe(1);
    const plain = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 24), { x: 0, z: 100 }, exact(), CRUISE, noRng);
    const banded = driveStep(
      createDriverState(0, 100),
      0.1,
      pose(0, 0, 0, 24),
      { x: 0, z: 100, paceBand: BAND, paceGap: 1.5 },
      exact(),
      CRUISE,
      noRng,
    );
    expect(banded.throttle).toBe(plain.throttle);
    expect(banded.brake).toBe(plain.brake);
  });

  test("the rule ramps past the tolerance, clamps at full effect, and the scale is a per-car share", () => {
    expect(paceBandFactor(BAND, 7)).toBeCloseTo(1 - 0.25 * 0.5);
    expect(paceBandFactor(BAND, 400)).toBeCloseTo(0.75);
    expect(paceBandFactor(BAND, -12)).toBeCloseTo(1 + 0.5 * 0.5);
    expect(paceBandFactor(BAND, -400)).toBeCloseTo(1.5);
    // The expert concedes less than the rookie with the same gap; a still margin or scale is level.
    expect(paceBandFactor({ ...BAND, scale: 0.5 }, 400)).toBeGreaterThan(paceBandFactor(BAND, 400));
    expect(paceBandFactor({ ...BAND, scale: 0 }, 400)).toBe(1);
    expect(paceBandFactor({ ...BAND, margin: 400 }, 400)).toBe(1);
  });

  test("a leader out past its margin eases off the throttle", () => {
    const cruise = { x: 0, z: 100, paceBand: BAND, paceGap: 0 };
    const level = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 30), cruise, exact(), CRUISE, noRng);
    expect(level.throttle).toBe(0);
    expect(level.brake).toBe(0);
    const ahead = driveStep(createDriverState(0, 100), 0.1, pose(0, 0, 0, 30), { ...cruise, paceGap: 30 }, exact(), CRUISE, noRng);
    expect(ahead.throttle).toBe(0);
    expect(ahead.brake).toBeGreaterThan(0);
  });

  test("a chaser behind the field pushes past its cruise pace and closes the gap", () => {
    const state = createDriverState(0, 1);
    const dt = 1 / 60;
    let z = 0;
    let speed = 0;
    let leaderZ = 60;
    let gap = z - leaderZ;
    let peak = 0;
    for (let tick = 0; tick < 60 * 20 && gap < -4; tick += 1) {
      leaderZ += 20 * dt;
      const step = driveStep(
        state,
        dt,
        pose(0, z, 0, speed),
        { x: 0, z: z + 50, speedLimit: 18, paceBand: BAND, paceGap: gap },
        exact(),
        CRUISE,
        noRng,
      );
      speed = Math.max(0, speed + step.throttle * 8 * dt - step.brake * 16 * dt);
      z += speed * dt;
      gap = z - leaderZ;
      peak = Math.max(peak, speed);
    }
    // Cruise pace is 18 and the leader runs 20, so only the push can take this car past it.
    expect(peak).toBeGreaterThan(25);
    expect(speed).toBeGreaterThan(18);
    expect(gap).toBeGreaterThan(-10);
  });

  test("the push never outdrives the car's own top speed", () => {
    const capped: DriverTuning = { maxSpeed: 18 };
    const step = driveStep(
      createDriverState(0, 100),
      0.1,
      pose(0, 0, 0, 18),
      { x: 0, z: 100, speedLimit: 18, paceBand: BAND, paceGap: -60 },
      exact(),
      capped,
      noRng,
    );
    expect(step.throttle).toBe(0);
    expect(step.brake).toBe(0);
  });
});

describe("pathTargetAhead", () => {
  const square: readonly (readonly [number, number])[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  test("advances the lookahead along the current segment", () => {
    const target = pathTargetAhead([[0, 0], [20, 0]], 5, 1, 6);
    expect(target).toEqual([11, 0]);
  });

  test("walks across corners", () => {
    const target = pathTargetAhead(square, 8, 0.5, 6);
    expect(target![0]).toBe(10);
    expect(target![1]).toBeCloseTo(4);
  });

  test("pins at the end of an open path", () => {
    expect(pathTargetAhead([[0, 0], [10, 0]], 9, 0, 50)).toEqual([10, 0]);
  });

  test("wraps around a loop", () => {
    // Near the end of the closed square, a long lookahead wraps back onto the first leg.
    const target = pathTargetAhead(square, 0, 2, 6, true);
    expect(target![1]).toBe(0);
    expect(target![0]).toBeCloseTo(4);
  });

  test("degenerate path returns null", () => {
    expect(pathTargetAhead([[0, 0]], 0, 0, 5)).toBeNull();
  });
});
