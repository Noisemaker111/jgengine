import { describe, expect, test } from "bun:test";

import { BIRD_WALK_RUN_FROUDE, bipedRunningSupport, compareBiped, HUTCHINSON_BIPEDS, requiredExtensorMass, scaleBipedLimb, theropodMassFromLegLength, validateBipedReference } from "./bipedRunning";
import { speedAtFroude } from "./quadrupedGait";

describe("biped reference", () => {
  test("published bird and theropod leg muscle and top speeds pass", () => {
    const failing = validateBipedReference().filter((row) => !row.pass);
    expect(failing).toEqual([]);
  });

  test("required muscle grows with leg length and ground force", () => {
    const rex = HUTCHINSON_BIPEDS.tyrannosaurus;
    const half = scaleBipedLimb(rex, rex.legLength / 2);
    expect(half.mass).toBeCloseTo(rex.mass / 8, 6);
    expect(bipedRunningSupport(half).total).toBeCloseTo(bipedRunningSupport(rex).total / 2, 6);
    expect(requiredExtensorMass(rex, "hip", 1.25)).toBeCloseTo(requiredExtensorMass(rex, "hip") / 2, 9);
    expect(Number.isNaN(requiredExtensorMass(HUTCHINSON_BIPEDS.alligator, "knee"))).toBe(true);
  });

  test("an ostrich-sized walk-run change and a big theropod that cannot run fast", () => {
    // Daley et al. 2016: an ostrich on a 1.26 m hip changes to a run at 2.05 m/s.
    expect(speedAtFroude(BIRD_WALK_RUN_FROUDE.up, 1.26)).toBeCloseTo(2.04, 1);
    const rex = compareBiped({ walkSpeed: 2, runSpeed: 8, hipHeight: 3.09 });
    expect(rex.mass).toBeCloseTo(theropodMassFromLegLength(3.09), 6);
    expect(rex.walkGait).toBe("walk");
    expect(rex.runGait).toBe("run");
    expect(rex.runningSupport).toBeLessThan(1);
    const raptor = compareBiped({ walkSpeed: 1.5, hipHeight: 1.2 });
    expect(raptor.runningSupport).toBeGreaterThan(1);
    expect(Number.isNaN(raptor.runFroude)).toBe(true);
    expect(raptor.runGait).toBe("walk");
  });
});
