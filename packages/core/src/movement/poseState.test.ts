import { describe, expect, test } from "bun:test";

import { createPoseState, POSE_HITBOX } from "./poseState";

describe("createPoseState", () => {
  test("unknown instance defaults to standing and hip", () => {
    const state = createPoseState(() => null);
    expect(state.getPose("player-1")).toBe("standing");
    expect(state.getAim("player-1")).toBe("hip");
  });

  test("setPose succeeds when catalog allows and getPose reflects it", () => {
    const state = createPoseState(() => ({ poses: ["standing", "crouch"] }));
    expect(state.setPose("player-1", "crouch")).toBeNull();
    expect(state.getPose("player-1")).toBe("crouch");
  });

  test("setPose rejects poses outside the catalog list", () => {
    const state = createPoseState(() => ({ poses: ["standing"] }));
    const result = state.setPose("player-1", "prone");
    expect(result).not.toBeNull();
    expect(result?.reason).toContain("prone");
    expect(state.getPose("player-1")).toBe("standing");
  });

  test("entities without a declared poses list only allow standing", () => {
    const state = createPoseState(() => ({}));
    expect(state.setPose("npc-1", "crouch")).not.toBeNull();
  });

  test("setAim succeeds and rejects per catalog", () => {
    const state = createPoseState((instanceId) => (instanceId === "player-1" ? { aim: ["hip", "ads"] } : { aim: ["hip"] }));
    expect(state.setAim("player-1", "ads")).toBeNull();
    expect(state.getAim("player-1")).toBe("ads");
    expect(state.setAim("npc-1", "ads")).not.toBeNull();
  });

  test("clear resets an instance back to defaults", () => {
    const state = createPoseState(() => ({ poses: ["standing", "prone"], aim: ["hip", "ads"] }));
    state.setPose("player-1", "prone");
    state.setAim("player-1", "ads");
    state.clear("player-1");
    expect(state.getPose("player-1")).toBe("standing");
    expect(state.getAim("player-1")).toBe("hip");
  });
});

describe("POSE_HITBOX", () => {
  test("running shares standing's capsule but moves faster", () => {
    expect(POSE_HITBOX.running.height).toBe(POSE_HITBOX.standing.height);
    expect(POSE_HITBOX.running.eyeHeight).toBe(POSE_HITBOX.standing.eyeHeight);
    expect(POSE_HITBOX.running.speedMultiplier).toBeGreaterThan(POSE_HITBOX.standing.speedMultiplier);
  });

  test("prone is lower and slower than crouch", () => {
    expect(POSE_HITBOX.prone.height).toBeLessThan(POSE_HITBOX.crouch.height);
    expect(POSE_HITBOX.prone.speedMultiplier).toBeLessThan(POSE_HITBOX.crouch.speedMultiplier);
  });

  test("crouch is lower and slower than standing", () => {
    expect(POSE_HITBOX.crouch.height).toBeLessThan(POSE_HITBOX.standing.height);
    expect(POSE_HITBOX.crouch.speedMultiplier).toBeLessThan(POSE_HITBOX.standing.speedMultiplier);
  });
});
