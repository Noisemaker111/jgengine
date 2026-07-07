import { describe, expect, test } from "bun:test";
import {
  activeRangeAtFrame,
  createAnimationState,
  frameAtMs,
  phasesAtFrame,
  type AnimationClip,
} from "@jgengine/core/combat/animationState";

const swing: AnimationClip = {
  id: "swing",
  frames: 30,
  fps: 30,
  ranges: [
    { phase: "windup", from: 0, to: 10 },
    { phase: "active", from: 10, to: 16 },
    { phase: "recovery", from: 16, to: 30 },
    { phase: "cancel", from: 20, to: 30 },
  ],
};

describe("animation state machine", () => {
  test("frame-range tag lookup by frame", () => {
    expect(phasesAtFrame(swing, 5)).toEqual(["windup"]);
    expect(phasesAtFrame(swing, 12)).toEqual(["active"]);
    expect(phasesAtFrame(swing, 22)).toEqual(["recovery", "cancel"]);
    expect(activeRangeAtFrame(swing, 12)).toEqual({ phase: "active", from: 10, to: 16 });
    expect(activeRangeAtFrame(swing, 5)).toBeNull();
  });

  test("frameAtMs maps elapsed time to frame index", () => {
    expect(frameAtMs(swing, 0)).toBe(0);
    expect(frameAtMs(swing, 500)).toBeCloseTo(15);
    expect(frameAtMs(swing, 2000)).toBe(30);
  });

  test("tick transitions through windup/active/recovery and completes", () => {
    const anim = createAnimationState({ clips: [swing] });
    anim.play("swing");
    expect(anim.inPhase("windup")).toBe(true);

    anim.tick(11 / 30);
    expect(anim.isActive()).toBe(true);
    expect(anim.inPhase("active")).toBe(true);
    const window = anim.activeWindowMs();
    expect(window).not.toBeNull();
    expect(window?.from).toBeCloseTo((10 / 30) * 1000);

    const enterRecovery = anim.tick(10 / 30);
    expect(enterRecovery.entered).toContain("recovery");
    expect(anim.canCancel()).toBe(true);

    const done = anim.tick(1);
    expect(done.completed).toBe(true);
    expect(anim.current()).toBeNull();
  });

  test("looping clip wraps frames and never completes", () => {
    const idle: AnimationClip = {
      id: "idle",
      frames: 10,
      fps: 10,
      loop: true,
      ranges: [{ phase: "recovery", from: 0, to: 10 }],
    };
    const anim = createAnimationState({ clips: [idle] });
    anim.play("idle");
    const result = anim.tick(1.5);
    expect(result.completed).toBe(false);
    expect(anim.current()?.frame).toBeCloseTo(5);
  });
});
