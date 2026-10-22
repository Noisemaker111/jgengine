import { describe, expect, test } from "bun:test";

import {
  KAYKIT_SCHEME,
  MIXAMO_SCHEME,
  QUATERNIUS_ALIEN_SCHEME,
  RIG_SCHEMES,
  SKELETON_PARENT,
  SKELETON_SLOTS,
  SKELETON_STANDARD,
  mapRigToStandard,
  retargetBoneScales,
  retargetTracks,
  runtimeBoneName,
} from "./skeletonStandard";

/** The bones a loaded KayKit Knight carries, helper IK and prop nodes included. */
const KAYKIT_BONES = [
  "Rig",
  "root",
  "hips",
  "spine",
  "chest",
  "head",
  "upperarm.l",
  "upperarm.r",
  "lowerarm.l",
  "lowerarm.r",
  "hand.l",
  "hand.r",
  "handslot.l",
  "handslot.r",
  "upperleg.l",
  "upperleg.r",
  "lowerleg.l",
  "lowerleg.r",
  "foot.l",
  "foot.r",
  "toes.l",
  "toes.r",
  "kneeIK.l",
  "heelIK.l",
  "IK-foot.l",
  "control-foot-roll.l",
  "Knight_Body",
];

const MIXAMO_BONES = [
  "mixamorigHips",
  "mixamorigSpine",
  "mixamorigSpine1",
  "mixamorigSpine2",
  "mixamorigNeck",
  "mixamorigHead",
  "mixamorigLeftShoulder",
  "mixamorigLeftArm",
  "mixamorigLeftForeArm",
  "mixamorigLeftHand",
  "mixamorigLeftHandIndex1",
  "mixamorigRightArm",
  "mixamorigRightForeArm",
  "mixamorigRightHand",
  "mixamorigLeftUpLeg",
  "mixamorigLeftLeg",
  "mixamorigLeftFoot",
  "mixamorigLeftToeBase",
  "mixamorigRightUpLeg",
  "mixamorigRightLeg",
  "mixamorigRightFoot",
  "mixamorigRightToeBase",
];

const ALIEN_BONES = ["Root", "Spine_1", "Spine_2", "Spine_3", "Spine_4", "Spine_5", "Spine_6", "Neck", "Head", "ClawBig_1.L", "ClawBig_2.L", "ClawBig_3.L"];

describe("skeleton standard", () => {
  test("the standard's slots are self-consistent and parented in order", () => {
    for (const slot of SKELETON_SLOTS) {
      expect(SKELETON_STANDARD.slots[slot]).toBeDefined();
    }
    for (const [slot, parent] of Object.entries(SKELETON_PARENT)) {
      expect(SKELETON_SLOTS).toContain(slot as never);
      expect(SKELETON_SLOTS).toContain(parent as never);
      expect(SKELETON_SLOTS.indexOf(parent as never)).toBeLessThan(SKELETON_SLOTS.indexOf(slot as never));
    }
  });

  test("runtime names drop the dot GLTFLoader sanitizes", () => {
    expect(runtimeBoneName("upperleg.l")).toBe("upperlegl");
    expect(runtimeBoneName("handslot.r")).toBe("handslotr");
    expect(runtimeBoneName("hips")).toBe("hips");
  });

  test("a KayKit rig fills every slot and leaves only helpers unmapped", () => {
    const map = mapRigToStandard(KAYKIT_BONES, KAYKIT_SCHEME);
    expect(map.scheme).toBe("kaykit-humanoid");
    expect(map.missing).toEqual([]);
    expect(map.slots.hips).toBe("hips");
    expect(map.slots["upperLeg.l"]).toBe("upperleg.l");
    expect(map.slots["toes.r"]).toBe("toes.r");
    expect(map.unmapped).toContain("kneeIK.l");
    expect(map.unmapped).toContain("Rig");
  });

  test("an authored slot name resolves against a rig spelled without the dot", () => {
    const map = mapRigToStandard(["root", "hips", "upperlegl", "lowerlegl", "footl", "toesl"], KAYKIT_SCHEME);
    expect(map.slots["upperLeg.l"]).toBe("upperlegl");
    expect(map.slots["foot.l"]).toBe("footl");
    expect(map.missing).toContain("upperLeg.r");
  });

  test("a Mixamo rig maps onto the standard through its prefixed names", () => {
    const map = mapRigToStandard(MIXAMO_BONES, "mixamo");
    expect(map.scheme).toBe("mixamo");
    // Mixamo has no weapon slot bones; every limb, spine and toe slot resolves.
    expect(map.missing).toEqual(["handSlot.l", "handSlot.r"]);
    expect(map.slots["upperArm.l"]).toBe("mixamorigLeftArm");
    expect(map.slots["lowerLeg.r"]).toBe("mixamorigRightLeg");
    expect(map.slots["toes.l"]).toBe("mixamorigLeftToeBase");
    expect(map.slots.chest).toBe("mixamorigSpine2");
    expect(map.unmapped).toContain("mixamorigLeftHandIndex1");
  });

  test("the Quaternius alien maps its spine and head and reports the limbs it does not have", () => {
    const map = mapRigToStandard(ALIEN_BONES, "quaternius-alien");
    expect(map.scheme).toBe("quaternius-alien");
    expect(map.slots.root).toBe("Root");
    expect(map.slots.hips).toBe("Spine_1");
    expect(map.slots.spine).toBe("Spine_3");
    expect(map.slots.chest).toBe("Spine_5");
    expect(map.slots.head).toBe("Head");
    for (const slot of ["upperLeg.l", "lowerLeg.r", "foot.l", "upperArm.r", "hand.l", "toes.r"] as const) {
      expect(map.missing).toContain(slot);
    }
    expect(map.unmapped).toContain("ClawBig_1.L");
    expect(map.unmapped).toContain("Spine_6");
  });

  test("an unknown scheme names the schemes that exist", () => {
    expect(() => mapRigToStandard(["hips"], "no-such-scheme")).toThrow(/kaykit-humanoid/);
    expect(Object.keys(RIG_SCHEMES)).toContain(QUATERNIUS_ALIEN_SCHEME.id);
    expect(Object.keys(RIG_SCHEMES)).toContain(MIXAMO_SCHEME.id);
  });
});

describe("retargeting", () => {
  test("a Mixamo walk clip's tracks rename onto the standard's runtime bones", () => {
    const map = mapRigToStandard(MIXAMO_BONES, "mixamo");
    const tracks = [
      "mixamorigHips.position",
      "mixamorigLeftUpLeg.quaternion",
      "mixamorigRightFoot.quaternion",
      "mixamorigLeftHandIndex1.quaternion",
      "mixamorigHips.morphTargetInfluences",
      "noDotHere",
    ];
    expect(retargetTracks(tracks, map)).toEqual([
      "hips.position",
      "upperlegl.quaternion",
      "footr.quaternion",
      null,
      "hips.morphTargetInfluences",
      null,
    ]);
  });

  test("a track whose bone the target rig lacks is dropped rather than left dangling", () => {
    const map = mapRigToStandard(ALIEN_BONES, "quaternius-alien");
    expect(retargetTracks(["Spine_1.quaternion", "Spine_6.quaternion", "ClawBig_1.L.quaternion"], map)).toEqual([
      "hips.quaternion",
      null,
      null,
    ]);
  });

  test("bone-length ratios scale a source chain onto the target's proportions", () => {
    const scales = retargetBoneScales(
      [
        { slot: "upperLeg.l", length: 0.4 },
        { slot: "lowerLeg.l", length: 0.4 },
        { slot: "foot.l", length: 0 },
      ],
      [
        { slot: "upperLeg.l", length: 0.5 },
        { slot: "lowerLeg.l", length: 0.3 },
        { slot: "foot.l", length: 0.1 },
      ],
    );
    expect(scales["upperLeg.l"]).toBeCloseTo(1.25, 6);
    expect(scales["lowerLeg.l"]).toBeCloseTo(0.75, 6);
    expect(scales["foot.l"]).toBeUndefined();
    expect(scales["hand.l"]).toBeUndefined();
  });
});
