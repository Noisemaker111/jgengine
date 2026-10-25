import { describe, expect, test } from "bun:test";

import type { GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";
import { createLlmvilleRuntime } from "@llmville/game/game/runtime/definition";
import {
  SET_SESSION_POSE_COMMAND,
  sessionPoseOf,
  setSessionPoseCommand,
} from "@llmville/game/game/runtime/session";

function snapshot(): GameRuntimeSnapshot {
  return {
    version: 1,
    gameId: "llmville",
    serverId: "server_1",
    server: { entities: [], objects: [], session: {} },
    players: { user_1: { userId: "user_1", inventories: {}, economy: {}, unlocks: [] } },
    chunks: {},
    revision: 0,
    dirty: { server: false, players: [], chunks: [] },
  };
}

const POSE = { x: 4, y: 0, z: -12.5, rotationY: 1.25 };

describe("session.setPose", () => {
  test("stores the pose in the actor's session and marks them dirty", () => {
    const next = setSessionPoseCommand.apply(snapshot(), POSE, "user_1");
    expect(sessionPoseOf(next, "user_1")).toEqual(POSE);
    expect(next.dirty.players).toEqual(["user_1"]);
  });

  test("leaves other players untouched", () => {
    const next = setSessionPoseCommand.apply(snapshot(), POSE, "user_1");
    expect(sessionPoseOf(next, "user_2")).toBeNull();
  });

  test("rejects a non-member actor", () => {
    expect(setSessionPoseCommand.validate(snapshot(), POSE, "user_2")).toEqual({ reason: "not_a_member" });
  });

  test("rejects a malformed payload", () => {
    expect(setSessionPoseCommand.validate(snapshot(), null, "user_1")).toEqual({ reason: "invalid_pose" });
    expect(setSessionPoseCommand.validate(snapshot(), { x: 1, y: 2, z: 3 }, "user_1")).toEqual({ reason: "invalid_pose" });
    expect(setSessionPoseCommand.validate(snapshot(), { ...POSE, x: Number.NaN }, "user_1")).toEqual({ reason: "invalid_pose" });
  });

  test("accepts a well-formed payload", () => {
    expect(setSessionPoseCommand.validate(snapshot(), POSE, "user_1")).toBeNull();
  });

  test("round-trips through the runtime command table", () => {
    const result = createLlmvilleRuntime().runCommand(snapshot(), "user_1", SET_SESSION_POSE_COMMAND, POSE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sessionPoseOf(result.snapshot, "user_1")).toEqual(POSE);
    expect(result.snapshot.revision).toBe(1);
  });

  test("refuses a malformed payload through the runtime command table", () => {
    const result = createLlmvilleRuntime().runCommand(snapshot(), "user_1", SET_SESSION_POSE_COMMAND, { x: 1 });
    expect(result).toEqual({ ok: false, reason: "invalid_pose" });
  });
});
