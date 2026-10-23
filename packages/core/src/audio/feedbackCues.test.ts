import { describe, expect, test } from "bun:test";

import { DEFAULT_FEEDBACK_CUE_SOUNDS, FEEDBACK_CUES, feedbackCueSoundId, withFeedbackCueSounds } from "./feedbackCues";
import { patchDuration } from "./synth";

describe("withFeedbackCueSounds", () => {
  test("adds every default reaction on the sfx bus", () => {
    const { sounds, buses } = withFeedbackCueSounds({ hurt: { id: "hurt", bus: "sfx", url: "hurt.ogg" } }, undefined);
    for (const cue of FEEDBACK_CUES) {
      expect(sounds[feedbackCueSoundId(cue)]).toMatchObject({ bus: "sfx", positional: false });
    }
    expect(sounds.hurt?.url).toBe("hurt.ogg");
    expect(buses).toEqual({ sfx: { id: "sfx", gain: 0.9 } });
  });

  test("a game sound named feel.<cue> wins, then an override, and false silences", () => {
    const own = { id: "feel.kill", bus: "sfx", url: "own-kill.ogg" };
    const { sounds } = withFeedbackCueSounds({ "feel.kill": own }, undefined, {
      kill: { id: "x", bus: "sfx", url: "ignored.ogg" },
      wave: { id: "x", bus: "sfx", url: "wave.ogg" },
      deny: false,
    });
    expect(sounds["feel.kill"]).toBe(own);
    expect(sounds["feel.wave"]).toMatchObject({ url: "wave.ogg" });
    expect(sounds["feel.deny"]).toBeUndefined();
  });

  test("false keeps the catalog untouched, and a declared sfx bus keeps its gain", () => {
    expect(withFeedbackCueSounds({}, { music: { id: "music" } }, false).buses).toEqual({ music: { id: "music" } });
    expect(withFeedbackCueSounds({}, { sfx: { id: "sfx", gain: 0.3 } }).buses).toEqual({ sfx: { id: "sfx", gain: 0.3 } });
  });

  test("default reactions stay short enough to layer under a weapon", () => {
    for (const cue of FEEDBACK_CUES) {
      expect(patchDuration(DEFAULT_FEEDBACK_CUE_SOUNDS[cue].synth!)).toBeLessThan(0.6);
    }
  });
});
