import { afterEach, describe, expect, test } from "bun:test";

import {
  animationPhaseOf,
  characterLodInterval,
  characterLodPolicy,
  characterLodProbe,
  characterLodRate,
  characterLodTier,
  characterLodTierOf,
  characterViewTier,
  characterRigTier,
  DEFAULT_CHARACTER_LOD,
  noteAnimationPhase,
  noteCharacterFrame,
  noteCharacterPose,
  registerCharacterRig,
  resetCharacterLodStats,
  setCharacterLodTier,
  unregisterCharacterRig,
} from "./characterLod";

afterEach(() => resetCharacterLodStats());

describe("characterLodTier", () => {
  test("splits distances at the engine defaults", () => {
    expect(characterLodTier(0, undefined)).toBe("full");
    expect(characterLodTier(14.9, undefined)).toBe("full");
    expect(characterLodTier(15, undefined)).toBe("half");
    expect(characterLodTier(24.9, undefined)).toBe("half");
    expect(characterLodTier(25, undefined)).toBe("crowd");
    expect(characterLodTier(39.9, { crowdDistance: 100 })).toBe("half");
    expect(characterLodTier(40, { crowdDistance: 100 })).toBe("quarter");
  });

  test("thresholds come from the model's own data", () => {
    const policy = { fullRateDistance: 4, halfRateDistance: 8, crowdDistance: 20 };
    expect(characterLodTier(3, policy)).toBe("full");
    expect(characterLodTier(4, policy)).toBe("half");
    expect(characterLodTier(20, policy)).toBe("crowd");
  });

  test("a crowd character holds its representation until it is inside the hysteresis band", () => {
    expect(characterLodTier(24, { crowdDistance: 25, crowdHysteresis: 2 }, "crowd")).toBe("crowd");
    expect(characterLodTier(23.1, { crowdDistance: 25, crowdHysteresis: 2 }, "crowd")).toBe("crowd");
    expect(characterLodTier(22.9, { crowdDistance: 25, crowdHysteresis: 2 }, "crowd")).toBe("half");
    expect(characterLodTier(24, { crowdDistance: 25, crowdHysteresis: 2 }, "half")).toBe("half");
  });

  test("bad authoring falls back to the defaults instead of a tier that never matches", () => {
    const policy = characterLodPolicy({ fullRateDistance: Number.NaN, halfRateDistance: -2, crowdDistance: Infinity });
    expect(policy).toEqual({
      fullRateDistance: DEFAULT_CHARACTER_LOD.fullRateDistance,
      halfRateDistance: DEFAULT_CHARACTER_LOD.halfRateDistance,
      crowdDistance: DEFAULT_CHARACTER_LOD.crowdDistance,
      crowdHysteresis: DEFAULT_CHARACTER_LOD.crowdHysteresis,
      crowdCapacity: DEFAULT_CHARACTER_LOD.crowdCapacity,
    });
    expect(characterLodPolicy({ fullRateDistance: 30, halfRateDistance: 10 }).halfRateDistance).toBe(30);
  });

  test("a pattern that batches every distance carries its own instance cap", () => {
    expect(characterLodPolicy({ crowdDistance: 0, crowdCapacity: 40 })).toMatchObject({ crowdDistance: 0, crowdCapacity: 40 });
    expect(characterLodTier(0, { crowdDistance: 0 })).toBe("crowd");
    // A negative cap is bad authoring, not "no batch": zero is how a pattern turns the batch off.
    expect(characterLodPolicy({ crowdCapacity: -5 }).crowdCapacity).toBe(DEFAULT_CHARACTER_LOD.crowdCapacity);
    expect(characterLodPolicy({ crowdCapacity: 0 }).crowdCapacity).toBe(0);
  });

  test("the rig tier ignores the crowd path, so an over-cap crowd falls back to posing its own rig", () => {
    expect(characterRigTier(3, undefined)).toBe("full");
    expect(characterRigTier(20, undefined)).toBe("half");
    expect(characterRigTier(60, undefined)).toBe("quarter");
    expect(characterRigTier(3, { crowdDistance: 0 })).toBe("full");
  });
});

describe("characterLodRate", () => {
  test("each tier poses the rig on its own share of frames", () => {
    expect(characterLodRate("full")).toBe(1);
    expect(characterLodRate("half")).toBe(0.5);
    expect(characterLodRate("quarter")).toBe(0.25);
    expect(characterLodRate("crowd")).toBe(0);
    expect([characterLodInterval("full"), characterLodInterval("half"), characterLodInterval("quarter")]).toEqual([1, 2, 4]);
    expect(characterLodInterval("crowd")).toBe(0);
    expect(characterLodInterval("hidden")).toBe(0);
  });
});

describe("characterViewTier", () => {
  const view = { shown: true, local: false, lod: undefined, distance: 5, crowd: false };
  test("a character out of view is never posed", () => {
    expect(characterViewTier({ ...view, shown: false })).toBe("hidden");
    expect(characterViewTier({ ...view, shown: false, crowd: true, distance: 80 })).toBe("hidden");
  });

  test("a character with no crowd batch still poses at the rate its distance earns", () => {
    expect([5, 20, 60].map((distance) => characterViewTier({ ...view, distance }))).toEqual(["full", "half", "quarter"]);
    expect(characterViewTier({ ...view, distance: 60, crowd: true })).toBe("crowd");
  });

  test("the local player and a model without LOD always pose at full rate", () => {
    expect(characterViewTier({ ...view, local: true, shown: false, distance: 60 })).toBe("full");
    expect(characterViewTier({ ...view, lod: false, shown: false, distance: 60 })).toBe("full");
  });
});

describe("characterLodProbe", () => {
  test("counts rigs, skinned parts and the pose writes per frame the tiers leave", () => {
    registerCharacterRig("a", 1, 41);
    registerCharacterRig("b", 1, 41);
    setCharacterLodTier("a", "full");
    setCharacterLodTier("b", "crowd");
    noteCharacterFrame();
    noteCharacterPose("a");
    expect(characterLodTierOf("a")).toBe("full");
    expect(characterLodTierOf("b")).toBe("crowd");
    expect(characterLodTierOf(undefined)).toBe("full");
    const counters = characterLodProbe().counters!();
    expect(counters).toMatchObject({ rigs: 2, skinnedParts: 2, bones: 82, boneWritesPerFrame: 41, fullRate: 1, crowdRate: 1 });
    expect(characterLodProbe().state!()).toContain("2 rigs");
  });

  test("publishes the pose a rig is holding so the crowd can continue it", () => {
    registerCharacterRig("a", 1, 4);
    noteAnimationPhase("a", "Walk", 0.75);
    expect(characterLodTierOf("a")).toBe("full");
    unregisterCharacterRig("a");
    expect(characterLodProbe().counters!()).toMatchObject({ rigs: 0 });
  });

  test("a rig re-publishing its pose keeps one record and the latest clip", () => {
    registerCharacterRig("a", 1, 4);
    noteAnimationPhase("a", "Walk", 0.25);
    const first = animationPhaseOf("a");
    noteAnimationPhase("a", "Run", 0.9);
    expect(animationPhaseOf("a")).toBe(first);
    expect(animationPhaseOf("a")).toEqual({ clip: "Run", time: 0.9 });
  });

  test("forgetting a rig forgets its published pose", () => {
    registerCharacterRig("a", 1, 4);
    noteAnimationPhase("a", "Walk", 0.25);
    unregisterCharacterRig("a");
    expect(animationPhaseOf("a")).toBeUndefined();
  });
});
