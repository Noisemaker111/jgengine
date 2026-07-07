import { describe, expect, test } from "bun:test";
import { advanceCombo, createComboRunner, type ComboString } from "@jgengine/core/combat/comboString";
import { createAnimationState, type AnimationClip } from "@jgengine/core/combat/animationState";

const combo: ComboString = {
  id: "sword",
  entry: "light1",
  steps: [
    { id: "light1", clip: "l1", cancelInto: ["light2", "heavy"], cancelPhases: ["cancel", "recovery"] },
    { id: "light2", clip: "l2", cancelInto: ["finisher"] },
    { id: "heavy", clip: "h1", stance: "pillar", cancelInto: ["finisher"] },
    { id: "finisher", clip: "fin" },
  ],
};

describe("combo string", () => {
  test("entry step only accepted from idle", () => {
    expect(
      advanceCombo({ combo, currentStepId: null, requestedStepId: "light1", phases: [] }).accepted,
    ).toBe(true);
    const bad = advanceCombo({ combo, currentStepId: null, requestedStepId: "light2", phases: [] });
    expect(bad.accepted).toBe(false);
  });

  test("cancel only inside the cancel window", () => {
    const closed = advanceCombo({
      combo,
      currentStepId: "light1",
      requestedStepId: "light2",
      phases: ["windup"],
    });
    expect(closed).toEqual({ accepted: false, reason: "window-closed" });

    const open = advanceCombo({
      combo,
      currentStepId: "light1",
      requestedStepId: "light2",
      phases: ["cancel"],
    });
    expect(open.accepted).toBe(true);
  });

  test("non-chainable requests are rejected", () => {
    const result = advanceCombo({
      combo,
      currentStepId: "light2",
      requestedStepId: "heavy",
      phases: ["cancel"],
    });
    expect(result).toEqual({ accepted: false, reason: "not-chainable" });
  });

  test("stance-gated step needs the matching stance", () => {
    const wrong = advanceCombo({
      combo,
      currentStepId: "light1",
      requestedStepId: "heavy",
      phases: ["cancel"],
      stance: "thrust",
    });
    expect(wrong).toEqual({ accepted: false, reason: "wrong-stance" });

    const right = advanceCombo({
      combo,
      currentStepId: "light1",
      requestedStepId: "heavy",
      phases: ["cancel"],
      stance: "pillar",
    });
    expect(right.accepted).toBe(true);
  });

  test("runner drives the animation and tracks the current step", () => {
    const clips: AnimationClip[] = [
      { id: "l1", frames: 20, fps: 20, ranges: [{ phase: "cancel", from: 10, to: 20 }] },
      { id: "l2", frames: 20, fps: 20, ranges: [] },
    ];
    const anim = createAnimationState({ clips });
    const runner = createComboRunner(combo, anim);
    expect(runner.request("light1").accepted).toBe(true);
    expect(runner.currentStep()).toBe("light1");
    anim.tick(11 / 20);
    expect(runner.request("light2").accepted).toBe(true);
    expect(runner.currentStep()).toBe("light2");
    expect(anim.current()?.clipId).toBe("l2");
  });
});
