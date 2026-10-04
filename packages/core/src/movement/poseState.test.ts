import { describe, expect, test } from "bun:test";

import { createPoseState, POSE_HITBOX, withPoseRollback, type PoseState } from "./poseState";

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

test("owned pose rollback preserves implicit and explicit entries without restoring unrelated caller state", () => {
  for (const initial of [undefined, "standing", "prone"] as const) {
    const state = createPoseState(() => ({ poses: ["standing", "crouch", "prone", "running"], aim: ["hip", "ads"] }));
    if (initial !== undefined) state.setPose("pawn", initial);
    const poses = state.snapshotAll().poses;
    const externalCopy = { ...state };
    expect(() => withPoseRollback(externalCopy, "pawn", () => {
      externalCopy.setPose("pawn", "crouch");
      externalCopy.setPose("other", "running");
      externalCopy.setAim("pawn", "ads");
      throw Error("rollback");
    })).toThrow("rollback");
    const snapshot = state.snapshotAll();
    expect(snapshot.poses.pawn).toBe(poses.pawn);
    expect(Object.hasOwn(snapshot.poses, "pawn")).toBe(Object.hasOwn(poses, "pawn"));
    expect(snapshot.poses.other).toBe("running");
    expect(snapshot.aims.pawn).toBe("ads");
  }
});

test("successful owned pose changes commit and custom implementations retain semantic setter compatibility", () => {
  const owned = createPoseState(() => ({ poses: ["standing", "crouch", "prone"] }));
  expect(withPoseRollback(owned, "pawn", () => { owned.setPose("pawn", "crouch"); return 42; })).toBe(42);
  expect(owned.getPose("pawn")).toBe("crouch");
  const custom: PoseState = { ...owned, getPose: id => owned.getPose(id) };
  expect(() => withPoseRollback(custom, "pawn", () => { custom.setPose("pawn", "prone"); throw Error("external"); })).toThrow("external");
  expect(custom.getPose("pawn")).toBe("crouch");
});
