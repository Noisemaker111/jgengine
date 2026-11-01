import { describe, expect, test } from "bun:test";

import { defaultAnimationForClips, idleOnlyAnimation } from "@jgengine/core/game/clipRoles";
import { animGraphFromConfig, LOCOMOTION_TURN_STATE } from "./locomotionGraph";
import { CHARACTER_MOTION_ON, characterMotionFromKey, characterMotionKey, planCharacterMotion, resolveCharacterMotion } from "./characterMotion";

const rigged = { live: true, lowTier: false, dead: false, ik: undefined, authoredAnimation: false };

describe("a rigged live entity stands, walks and looks around by default", () => {
  test("it gets foot IK, the glance and the locomotion graph when nothing switches them off", () => {
    expect(planCharacterMotion({ ...rigged, motion: resolveCharacterMotion() })).toEqual({ footIk: "auto", glance: true, locomotion: "graph" });
  });

  test("each part switches off on its own, per game, per model or per entity", () => {
    expect(planCharacterMotion({ ...rigged, motion: resolveCharacterMotion({ footIk: false }) })).toEqual({ footIk: undefined, glance: true, locomotion: "graph" });
    expect(planCharacterMotion({ ...rigged, motion: resolveCharacterMotion(undefined, { glance: false }) })).toEqual({ footIk: "auto", glance: false, locomotion: "graph" });
    expect(planCharacterMotion({ ...rigged, motion: resolveCharacterMotion(undefined, undefined, { locomotion: false }) })).toEqual({ footIk: "auto", glance: true, locomotion: "idle" });
    expect(planCharacterMotion({ ...rigged, motion: resolveCharacterMotion(false) })).toEqual({ footIk: undefined, glance: false, locomotion: "idle" });
  });

  test("a later layer wins: an entity can turn back on what its game turned off", () => {
    expect(resolveCharacterMotion(false, undefined, { footIk: true })).toEqual({ footIk: true, glance: false, locomotion: false });
    expect(resolveCharacterMotion({ glance: false }, { glance: true })).toEqual(CHARACTER_MOTION_ON);
  });

  test("previews, the low tier, the dead and an authored rig keep their old behaviour", () => {
    expect(planCharacterMotion({ ...rigged, live: false, motion: CHARACTER_MOTION_ON })).toEqual({ footIk: undefined, glance: false, locomotion: "none" });
    expect(planCharacterMotion({ ...rigged, lowTier: true, motion: CHARACTER_MOTION_ON }).footIk).toBeUndefined();
    expect(planCharacterMotion({ ...rigged, dead: true, motion: CHARACTER_MOTION_ON }).glance).toBe(false);
    expect(planCharacterMotion({ ...rigged, ik: "none", motion: CHARACTER_MOTION_ON })).toEqual({ footIk: undefined, glance: false, locomotion: "graph" });
    expect(planCharacterMotion({ ...rigged, authoredAnimation: true, motion: CHARACTER_MOTION_ON }).locomotion).toBe("authored");
  });

  test("an entity's switches survive the key a view re-renders on", () => {
    for (const layer of [undefined, false, {}, { footIk: false }, { glance: true, locomotion: false }] as const) {
      expect(characterMotionFromKey(characterMotionKey(layer))).toEqual(layer);
    }
  });
});

describe("locomotion from a rig's own clips", () => {
  const clips = ["Idle", "Walking_A", "Running_A", "Turn_Left", "Death_A"];

  test("a turn clip drives turn in place", () => {
    const config = defaultAnimationForClips(clips);
    expect(config?.states?.turn).toBe("Turn_Left");
    if (config === undefined) throw new Error("no idle clip");
    const graph = animGraphFromConfig(config);
    const turn = graph?.layers[0]?.states[LOCOMOTION_TURN_STATE];
    expect(JSON.stringify(turn)).toContain("Turn_Left");
  });

  test("with locomotion off the rig holds its idle clip, never the bind pose", () => {
    expect(idleOnlyAnimation(clips)).toEqual({ clip: "Idle" });
    expect(idleOnlyAnimation(["Death_A"])).toBeUndefined();
  });
});
