import { describe, expect, test } from "bun:test";
import { inferLegChains, placeFeet, type FootPlacementInput } from "./footPlacement";

const base: Omit<FootPlacementInput, "feet"> = { originY: 0, ankleHeight: 0.1, maxAdjust: 0.5, airborneGap: 0.3 };

describe("placeFeet", () => {
  test("flat ground leaves an authored stance untouched", () => {
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.1, groundY: 0 }, { ankleY: 0.1, groundY: 0 }] });
    expect(placement.pelvisOffset).toBe(0);
    expect(placement.ankleTargets).toEqual([0.1, 0.1]);
    expect(placement.grounded).toBe(true);
  });

  test("keeps the swing foot's animated lift on flat ground", () => {
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.1, groundY: 0 }, { ankleY: 0.35, groundY: 0 }] });
    expect(placement.ankleTargets).toEqual([0.1, 0.35]);
  });

  test("on a slope the uphill foot rises, the downhill foot drops and the pelvis follows the drop", () => {
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.1, groundY: 0.15 }, { ankleY: 0.1, groundY: -0.2 }] });
    expect(placement.ankleTargets[0]).toBeCloseTo(0.25, 9);
    expect(placement.ankleTargets[1]).toBeCloseTo(-0.1, 9);
    expect(placement.pelvisOffset).toBeCloseTo(-0.2, 9);
  });

  test("lifts a sole the clip sinks below the ground", () => {
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.078, groundY: 0 }] });
    expect(placement.ankleTargets[0]).toBeCloseTo(0.1, 9);
    expect(placement.pelvisOffset).toBe(0);
  });

  test("an origin sunk into the ground raises both feet onto it", () => {
    const placement = placeFeet({ ...base, originY: -0.05, feet: [{ ankleY: 0.05, groundY: 0 }, { ankleY: 0.05, groundY: 0 }] });
    expect(placement.ankleTargets).toEqual([0.1, 0.1]);
  });

  test("clamps corrections to maxAdjust", () => {
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.1, groundY: 2 }, { ankleY: 0.1, groundY: -2 }] });
    expect(placement.ankleTargets).toEqual([0.6, -0.4]);
    expect(placement.pelvisOffset).toBe(-0.5);
  });

  test("feet well clear of the ground read as airborne with no pelvis shift", () => {
    const placement = placeFeet({ ...base, originY: 1, feet: [{ ankleY: 1.1, groundY: 0 }, { ankleY: 1.2, groundY: 0 }] });
    expect(placement.grounded).toBe(false);
    expect(placement.pelvisOffset).toBe(0);
  });

  test("a foot with no ground gets no target and reuses the output", () => {
    const out = { pelvisOffset: 1, ankleTargets: [1, 2, 3] as (number | null)[], grounded: true };
    const placement = placeFeet({ ...base, feet: [{ ankleY: 0.1, groundY: null }] }, out);
    expect(placement).toBe(out);
    expect(placement.ankleTargets).toEqual([null]);
    expect(placement.grounded).toBe(false);
  });
});

describe("inferLegChains", () => {
  const chain = (names: string[], parent: string | null) =>
    names.map((name, index) => ({ name, parent: index === 0 ? parent : names[index - 1]! }));

  test("finds KayKit legs past foot-roll and knee-IK helpers", () => {
    const bones = [
      { name: "root", parent: null },
      { name: "hips", parent: "root" },
      ...chain(["upperlegl", "lowerlegl", "footl", "toesl"], "hips"),
      ...chain(["upperlegr", "lowerlegr", "footr", "toesr"], "hips"),
      { name: "kneeIKl", parent: "root" },
      { name: "control-foot-rolll", parent: "root" },
      { name: "IK-footl", parent: "control-foot-rolll" },
    ];
    expect(inferLegChains(bones)).toEqual([
      { root: "upperlegl", mid: "lowerlegl", tip: "footl" },
      { root: "upperlegr", mid: "lowerlegr", tip: "footr" },
    ]);
  });

  test("finds Mixamo and Blender-style names", () => {
    const bones = [
      { name: "mixamorigHips", parent: null },
      ...chain(["mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigLeftFoot"], "mixamorigHips"),
      ...chain(["thigh.R", "shin.R", "foot.R"], "mixamorigHips"),
    ];
    expect(inferLegChains(bones)).toEqual([
      { root: "mixamorigLeftUpLeg", mid: "mixamorigLeftLeg", tip: "mixamorigLeftFoot" },
      { root: "thigh.R", mid: "shin.R", tip: "foot.R" },
    ]);
  });

  test("skips a thigh without a two-bone chain below it", () => {
    expect(inferLegChains([{ name: "Thigh_L", parent: null }, { name: "Shin_L", parent: "Thigh_L" }])).toEqual([]);
  });
});
