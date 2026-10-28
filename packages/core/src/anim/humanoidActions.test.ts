import { describe, expect, test } from "bun:test";

import { createAnimGraphRuntime } from "./animGraph";
import { HUMANOID_ACTION_NAMES, HUMANOID_ACTION_SLOTS, HUMANOID_ACTIONS, humanoidAnimation, mirrorHumanoidPose } from "./humanoidActions";
import {
  LOCOMOTION_AIRBORNE_PARAM,
  LOCOMOTION_AIRBORNE_STATE,
  LOCOMOTION_LAYER,
  LOCOMOTION_SPEED_PARAM,
  LOCOMOTION_STATE,
  LOCOMOTION_SWIM_STATE,
  LOCOMOTION_SWIMMING_PARAM,
  animGraphFromConfig,
} from "./locomotionGraph";
import { BIPED_SCHEME, detectHumanoidRig, mapRigToStandard } from "./skeletonStandard";

/** The bones a pulled Rocketbox human carries (runtime names), face and finger bones trimmed. */
const ROCKETBOX_BONES = [
  "Bip01", "Bip01_Pelvis", "Bip01_Spine", "Bip01_Spine1", "Bip01_Spine2", "Bip01_Neck", "Bip01_Head",
  "Bip01_L_Clavicle", "Bip01_L_UpperArm", "Bip01_L_Forearm", "Bip01_L_Hand", "Bip01_L_Finger0",
  "Bip01_R_Clavicle", "Bip01_R_UpperArm", "Bip01_R_Forearm", "Bip01_R_Hand", "Bip01_R_Finger0",
  "Bip01_L_Thigh", "Bip01_L_Calf", "Bip01_L_Foot", "Bip01_L_Toe0",
  "Bip01_R_Thigh", "Bip01_R_Calf", "Bip01_R_Foot", "Bip01_R_Toe0", "Bip01_MJaw", "Bip01_LEye",
];

const CLIP_SECONDS = { Idle: 3, Walk: 1.1, Run: 0.7, ...Object.fromEntries(HUMANOID_ACTION_NAMES.map((name) => [name, HUMANOID_ACTIONS[name].duration])) };

describe("humanoid rig mapping", () => {
  test("a Rocketbox rig maps onto every standard body slot through the Biped scheme", () => {
    const map = detectHumanoidRig(ROCKETBOX_BONES);
    expect(map?.scheme).toBe(BIPED_SCHEME.id);
    expect(map?.slots).toMatchObject({ hips: "Bip01_Pelvis", chest: "Bip01_Spine2", "hand.r": "Bip01_R_Hand", "upperLeg.l": "Bip01_L_Thigh", "toes.r": "Bip01_R_Toe0" });
    expect(map?.missing).toEqual(["handSlot.l", "handSlot.r"]);
  });

  test("a rig without a full body is never posed as a person", () => {
    expect(detectHumanoidRig(["Root", "Spine_1", "Spine_3", "Spine_5", "Head"])).toBeNull();
    expect(detectHumanoidRig(["Bip01", "Bip01_Pelvis", "Bip01_Spine", "Bip01_Head", "Bip01_L_Thigh", "Bip01_R_Thigh"])).toBeNull();
  });

  test("the Biped scheme reads authored names with spaces the same as runtime names", () => {
    expect(mapRigToStandard(["Bip01 R Hand", "Bip01 Pelvis"], BIPED_SCHEME).slots).toEqual({ hips: "Bip01 Pelvis", "hand.r": "Bip01 R Hand" });
  });
});

describe("authored humanoid actions", () => {
  test("every clip's keys run in order and end at its duration; loops close on their first pose", () => {
    for (const name of HUMANOID_ACTION_NAMES) {
      const clip = HUMANOID_ACTIONS[name];
      const times = clip.keys.map((key) => key.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(clip.duration);
      if (clip.loop) {
        const first = clip.keys[0];
        const last = clip.keys.at(-1);
        expect(JSON.stringify(last?.hips ?? null)).toBe(JSON.stringify(first?.hips ?? null));
        for (const slot of HUMANOID_ACTION_SLOTS) {
          const start = first?.rotate?.[slot];
          const end = last?.rotate?.[slot];
          if (start === undefined && end === undefined) continue;
          const [x, y, z] = start ?? [0, 0, 0];
          const [ex, ey, ez] = end ?? [0, 0, 0];
          expect([((ex - x) % 360 + 360) % 360, ey - y, ez - z]).toEqual([0, 0, 0]);
        }
      }
    }
  });

  test("one-shots start and end on the idle pose so they blend back into locomotion", () => {
    for (const name of ["Punch", "Swing", "Gather", "Hurt"] as const) {
      const clip = HUMANOID_ACTIONS[name];
      expect(clip.loop).toBe(false);
      expect(clip.keys[0]?.rotate).toBeUndefined();
      expect(clip.keys.at(-1)?.rotate).toBeUndefined();
    }
  });

  test("mirroring swaps sides and reverses the turns about the vertical and forward axes", () => {
    expect(mirrorHumanoidPose({ "upperArm.l": [-30, 10, 20], spine: [5, 4, 3] })).toEqual({ spine: [5, -4, -3], "upperArm.r": [-30, -10, -20] });
  });
});

describe("humanoid animation state mapping", () => {
  const graph = animGraphFromConfig(humanoidAnimation({ idle: "Idle", walk: "Walk", run: "Run" }));
  if (graph === undefined) throw new Error("humanoidAnimation must build a graph");
  const step = (runtime: ReturnType<typeof createAnimGraphRuntime>, params: Record<string, number | boolean>) => {
    for (let i = 0; i < 30; i++) runtime.advance(0.05, params, CLIP_SECONDS);
    return runtime.stateOf(LOCOMOTION_LAYER);
  };

  test("the body jumps while the motor reports it airborne and lands back into locomotion", () => {
    const runtime = createAnimGraphRuntime(graph);
    expect(step(runtime, { [LOCOMOTION_SPEED_PARAM]: 2 })).toBe(LOCOMOTION_STATE);
    expect(step(runtime, { [LOCOMOTION_SPEED_PARAM]: 2, [LOCOMOTION_AIRBORNE_PARAM]: true })).toBe(LOCOMOTION_AIRBORNE_STATE);
    expect(step(runtime, { [LOCOMOTION_SPEED_PARAM]: 2, [LOCOMOTION_AIRBORNE_PARAM]: false })).toBe(LOCOMOTION_STATE);
  });

  test("swimming outranks airborne, treads in place and strokes when moving", () => {
    const runtime = createAnimGraphRuntime(graph);
    expect(step(runtime, { [LOCOMOTION_SWIMMING_PARAM]: true, [LOCOMOTION_AIRBORNE_PARAM]: true })).toBe(LOCOMOTION_SWIM_STATE);
    const still = runtime.advance(0.05, { [LOCOMOTION_SWIMMING_PARAM]: true, [LOCOMOTION_SPEED_PARAM]: 0 }, CLIP_SECONDS);
    expect(still.clips.find((clip) => clip.weight > 0.5)?.clip).toBe("Tread");
    const moving = runtime.advance(0.05, { [LOCOMOTION_SWIMMING_PARAM]: true, [LOCOMOTION_SPEED_PARAM]: 3 }, CLIP_SECONDS);
    expect(moving.clips.find((clip) => clip.weight > 0.5)?.clip).toBe("Swim");
    expect(step(runtime, { [LOCOMOTION_SWIMMING_PARAM]: false })).toBe(LOCOMOTION_STATE);
  });

  test("a custom mover with no motor parameters never jumps or swims", () => {
    const runtime = createAnimGraphRuntime(graph);
    expect(step(runtime, { [LOCOMOTION_SPEED_PARAM]: 1 })).toBe(LOCOMOTION_STATE);
  });

  test("swing, gather, attack, hit and death fire their clips; death holds", () => {
    for (const [trigger, clip] of [["swing", "Swing"], ["gather", "Gather"], ["attack", "Punch"], ["hit", "Hurt"]] as const) {
      const runtime = createAnimGraphRuntime(graph);
      runtime.trigger(trigger);
      runtime.advance(0, {}, CLIP_SECONDS);
      const output = runtime.advance(0.2, {}, CLIP_SECONDS);
      expect(output.clips.some((entry) => entry.clip === clip && entry.weight > 0.5)).toBe(true);
      expect(step(runtime, {})).toBe(LOCOMOTION_STATE);
    }
    const runtime = createAnimGraphRuntime(graph);
    runtime.trigger("death");
    expect(step(runtime, { [LOCOMOTION_AIRBORNE_PARAM]: true })).toBe("death");
  });
});
