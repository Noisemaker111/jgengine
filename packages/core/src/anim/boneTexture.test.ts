import { describe, expect, test } from "bun:test";
import { planBoneTexture, sampleBoneTexture } from "./boneTexture";

describe("planBoneTexture", () => {
  test("stacks clips as rows with first and last pose baked", () => {
    const layout = planBoneTexture({ boneCount: 20, fps: 10, clips: [{ name: "Idle", duration: 1 }, { name: "Walk", duration: 0.55 }] });
    expect(layout.width).toBe(80);
    expect(layout.clips).toEqual([
      { name: "Idle", startFrame: 0, frameCount: 11, duration: 1 },
      { name: "Walk", startFrame: 11, frameCount: 7, duration: 0.55 },
    ]);
    expect(layout.height).toBe(18);
  });

  test("a zero-length pose clip still gets two rows", () => {
    expect(planBoneTexture({ boneCount: 1, clips: [{ name: "Pose", duration: 0 }] }).clips[0]!.frameCount).toBe(2);
  });

  test("refuses rigs and clip sets over the texture limit", () => {
    expect(() => planBoneTexture({ boneCount: 300, clips: [], maxTextureSize: 1024 })).toThrow(/bones/);
    expect(() => planBoneTexture({ boneCount: 10, fps: 60, clips: [{ name: "Long", duration: 30 }], maxTextureSize: 1024 })).toThrow(/fps/);
  });
});

describe("sampleBoneTexture", () => {
  const clip = { name: "Walk", startFrame: 11, frameCount: 11, duration: 1 };

  test("interpolates between neighbouring rows", () => {
    const sample = sampleBoneTexture(clip, 10, 0.25, true);
    expect(sample.rowA).toBe(13);
    expect(sample.rowB).toBe(14);
    expect(sample.t).toBeCloseTo(0.5, 9);
  });

  test("wraps looping clips, including negative offsets", () => {
    expect(sampleBoneTexture(clip, 10, 1.25, true).rowA).toBe(13);
    expect(sampleBoneTexture(clip, 10, -0.25, true).rowA).toBe(18);
  });

  test("holds the last pose of a one-shot", () => {
    expect(sampleBoneTexture(clip, 10, 5, false)).toEqual({ rowA: 21, rowB: 21, t: 0 });
  });
});
