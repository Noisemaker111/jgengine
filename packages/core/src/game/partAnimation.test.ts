import { describe, expect, test } from "bun:test";

import {
  createPartPose,
  partMotionPhase,
  sampleBodyPose,
  samplePartPose,
  type PartMotionInput,
} from "./partAnimation";

const WALKING: PartMotionInput = { timeSec: 0.35, speed: 2, phase: 0, flinch: 0, death: 0 };
const STANDING: PartMotionInput = { timeSec: 0.35, speed: 0, phase: 0, flinch: 0, death: 0 };

describe("samplePartPose", () => {
  test("is deterministic for identical input", () => {
    expect(samplePartPose("leg.l", WALKING)).toEqual(samplePartPose("leg.l", WALKING));
  });

  test("legs swing counter-phase at full walk", () => {
    const left = samplePartPose("leg.l", WALKING);
    const right = samplePartPose("leg.r", WALKING);
    expect(left.rotation[0]).not.toBe(0);
    expect(right.rotation[0]).toBeCloseTo(-left.rotation[0], 10);
  });

  test("arms counter their same-side leg", () => {
    const leg = samplePartPose("leg.l", WALKING);
    const arm = samplePartPose("arm.l", WALKING);
    expect(Math.sign(arm.rotation[0])).toBe(-Math.sign(leg.rotation[0]));
  });

  test("limb swing scales with speed and is zero standing still", () => {
    const still = samplePartPose("leg.l", STANDING);
    const half = samplePartPose("leg.l", { ...WALKING, speed: 1 });
    const full = samplePartPose("leg.l", WALKING);
    expect(still.rotation[0]).toBeCloseTo(0, 10);
    expect(Math.abs(half.rotation[0])).toBeLessThan(Math.abs(full.rotation[0]));
    expect(half.rotation[0]).toBeCloseTo(full.rotation[0] / 2, 10);
  });

  test("death fades limb motion to zero", () => {
    const dead = samplePartPose("leg.l", { ...WALKING, death: 1 });
    expect(dead.rotation[0]).toBeCloseTo(0, 10);
    expect(dead.position[1]).toBeCloseTo(0, 10);
  });

  test("wings mirror each other", () => {
    const left = samplePartPose("wing.l", WALKING);
    const right = samplePartPose("wing.r", WALKING);
    expect(right.rotation[2]).toBeCloseTo(-left.rotation[2], 10);
  });

  test("head flinches at half body strength", () => {
    const head = samplePartPose("head", { ...STANDING, flinch: 1 });
    const body = sampleBodyPose({ ...STANDING, flinch: 1 });
    expect(head.rotation[0]).toBeCloseTo(body.rotation[0] / 2, 10);
  });

  test("params override amplitude", () => {
    const wide = samplePartPose("leg.l", WALKING, { swingRad: 1.4 });
    const base = samplePartPose("leg.l", WALKING);
    expect(wide.rotation[0]).toBeCloseTo(base.rotation[0] * 2, 10);
  });

  test("reuses the out pose without allocating", () => {
    const out = createPartPose();
    const result = samplePartPose("leg.l", WALKING, undefined, out);
    expect(result).toBe(out);
  });
});

describe("sampleBodyPose", () => {
  test("bobs while walking and breathes while idle", () => {
    const walking = sampleBodyPose({ ...WALKING, timeSec: 0.1 });
    const idle = sampleBodyPose({ ...STANDING, timeSec: 0.3 });
    expect(walking.position[1]).toBeGreaterThan(0);
    expect(idle.position[1]).not.toBe(0);
  });

  test("flinch pitches the body backward", () => {
    expect(sampleBodyPose({ ...STANDING, flinch: 1 }).rotation[0]).toBeLessThan(0);
  });

  test("death topples to the configured roll and stops other motion", () => {
    const dead = sampleBodyPose({ ...WALKING, death: 1 });
    expect(dead.rotation[2]).toBeCloseTo(Math.PI / 2, 10);
    expect(dead.position[1]).toBeCloseTo(0, 10);
    expect(dead.rotation[0]).toBeCloseTo(0, 10);
  });

  test("partial death blends topple in", () => {
    const half = sampleBodyPose({ ...STANDING, timeSec: 0, phase: 0, death: 0.5 });
    expect(half.rotation[2]).toBeCloseTo(Math.PI / 4, 10);
  });
});

describe("squash & stretch", () => {
  const SOFT = { squashAmp: 0.2 };
  const FOOTFALL: PartMotionInput = { timeSec: 0, speed: 2, phase: 0, flinch: 0, death: 0 }; // sin(stride) = 0
  const MIDSTEP: PartMotionInput = { ...FOOTFALL, timeSec: 1 / (4 * 1.6) }; // sin(stride) = 1

  test("rigid by default: scale stays exactly 1 walking, idle, flinching", () => {
    for (const input of [WALKING, STANDING, { ...STANDING, flinch: 1 }]) {
      expect(sampleBodyPose(input).scale).toEqual([1, 1, 1]);
    }
    expect(samplePartPose("leg.l", WALKING).scale).toEqual([1, 1, 1]);
  });

  test("footfall squashes deepest, released mid-step, volume-conserving", () => {
    const atFootfall = sampleBodyPose(FOOTFALL, SOFT);
    const atMidstep = sampleBodyPose(MIDSTEP, SOFT);
    expect(atFootfall.scale[1]).toBeLessThan(1);
    expect(atFootfall.scale[0]).toBeGreaterThan(1);
    expect(atFootfall.scale[2]).toBe(atFootfall.scale[0]);
    expect(atMidstep.scale[1]).toBeGreaterThan(atFootfall.scale[1]);
  });

  test("idle jelly breathe oscillates scale", () => {
    const inhale = sampleBodyPose({ ...STANDING, timeSec: 1 / (4 * 0.45) }, SOFT); // sin(breathe) = 1
    const exhale = sampleBodyPose({ ...STANDING, timeSec: 3 / (4 * 0.45) }, SOFT); // sin(breathe) = -1
    expect(inhale.scale[1]).toBeLessThan(1);
    expect(exhale.scale[1]).toBeGreaterThan(1);
  });

  test("flinch adds a squash pulse on soft bodies", () => {
    const calm = sampleBodyPose(FOOTFALL, SOFT);
    const hit = sampleBodyPose({ ...FOOTFALL, flinch: 1 }, SOFT);
    expect(hit.scale[1]).toBeLessThan(calm.scale[1]);
  });

  test('deathStyle "splat" flattens without toppling', () => {
    const splat = sampleBodyPose({ ...STANDING, death: 1 }, { ...SOFT, deathStyle: "splat" });
    expect(splat.scale[1]).toBeCloseTo(0.3, 10);
    expect(splat.scale[0]).toBeGreaterThan(1);
    expect(splat.rotation[2]).toBeCloseTo(0, 10);
  });

  test("default death style still topples with unit scale", () => {
    const topple = sampleBodyPose({ ...STANDING, death: 1 });
    expect(topple.rotation[2]).toBeCloseTo(Math.PI / 2, 10);
    expect(topple.scale).toEqual([1, 1, 1]);
  });
});

describe("partMotionPhase", () => {
  test("is deterministic and bounded", () => {
    expect(partMotionPhase("goblin-7")).toBe(partMotionPhase("goblin-7"));
    for (const id of ["a", "goblin-7", "x".repeat(50)]) {
      const phase = partMotionPhase(id);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  test("different ids spread phases", () => {
    expect(partMotionPhase("goblin-1")).not.toBe(partMotionPhase("goblin-2"));
  });
});
