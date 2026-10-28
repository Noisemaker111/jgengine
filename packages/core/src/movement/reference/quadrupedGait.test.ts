import { describe, expect, test } from "bun:test";

import { animalTopSpeed, compareQuadruped, froudeNumber, quadrupedMassFromHeight, quadrupedStride, speedAtFroude, trotGallopSpeed, validateQuadrupedReference, WALK_TROT_FROUDE } from "./quadrupedGait";

const HORSE = { mass: 500, hipHeight: 1.05 };

describe("quadruped reference", () => {
  test("gaits change at the published Froude number and transition speed", () => {
    const walkTrot = speedAtFroude(WALK_TROT_FROUDE, HORSE.hipHeight);
    const trotGallop = trotGallopSpeed(HORSE.mass);
    expect(froudeNumber(walkTrot, HORSE.hipHeight)).toBeCloseTo(0.35, 9);
    expect(quadrupedStride(HORSE, walkTrot * 0.99).gait).toBe("walk");
    expect(quadrupedStride(HORSE, walkTrot * 1.01).gait).toBe("trot");
    expect(quadrupedStride(HORSE, trotGallop * 1.01).gait).toBe("gallop");
    // A horse trots from about 1.9 m/s and gallops from about 5.9 m/s; a 26 kg dog gallops from about 3.1 m/s.
    expect(walkTrot).toBeGreaterThan(1.7);
    expect(walkTrot).toBeLessThan(2.1);
    expect(trotGallop).toBeGreaterThan(5.4);
    expect(trotGallop).toBeLessThan(6.4);
    expect(trotGallopSpeed(26)).toBeCloseTo(3.12, 1);
  });

  test("animals of different size stride alike at equal Froude numbers", () => {
    const dog = { mass: 28, hipHeight: 0.4 };
    const froude = 1.2;
    const a = quadrupedStride(dog, speedAtFroude(froude, dog.hipHeight));
    const b = quadrupedStride(HORSE, speedAtFroude(froude, HORSE.hipHeight));
    expect(a.strideLength / dog.hipHeight).toBeCloseTo(b.strideLength / HORSE.hipHeight, 9);
    expect(a.dutyFactorFore).toBeCloseTo(b.dutyFactorFore, 9);
    expect(a.strideFrequency).toBeGreaterThan(b.strideFrequency);
    expect(quadrupedStride(HORSE, speedAtFroude(1, HORSE.hipHeight)).dutyFactorFore).toBeCloseTo(0.52, 9);
  });

  test("top speed rises with mass, then falls for the largest animals", () => {
    expect(animalTopSpeed(50)).toBeGreaterThan(animalTopSpeed(5));
    expect(animalTopSpeed(4000)).toBeLessThan(animalTopSpeed(200));
    expect(quadrupedMassFromHeight(1.05)).toBeCloseTo(500, 9);
  });

  test("published top speeds and the trot–gallop duty factor pass", () => {
    const rows = validateQuadrupedReference();
    expect(rows.filter((r) => !r.pass).map((r) => r.metric)).toEqual([]);
  });

  test("a game creature is compared with the animal of its size", () => {
    const fast = compareQuadruped({ walkSpeed: 2, runSpeed: 30, hipHeight: 0.5 });
    expect(fast.walkGait).toBe("trot");
    expect(fast.runGait).toBe("gallop");
    expect(fast.topSpeedRatio).toBeGreaterThan(1.5);
    const walker = compareQuadruped({ walkSpeed: 1, hipHeight: 1, mass: 400 });
    expect(walker.walkGait).toBe("walk");
    expect(walker.mass).toBe(400);
    expect(Number.isNaN(walker.runFroude)).toBe(true);
  });
});
