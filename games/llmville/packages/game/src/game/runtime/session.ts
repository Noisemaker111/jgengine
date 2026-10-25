import type { CommandDef } from "@jgengine/core/runtime/commandRunner";
import { markPlayerDirty, type GameRuntimeSnapshot } from "@jgengine/core/runtime/snapshot";

export const SET_SESSION_POSE_COMMAND = "session.setPose";

export interface SessionPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSessionPose(value: unknown): value is SessionPose {
  if (typeof value !== "object" || value === null) return false;
  const pose = value as Record<string, unknown>;
  return (
    isFiniteNumber(pose.x)
    && isFiniteNumber(pose.y)
    && isFiniteNumber(pose.z)
    && isFiniteNumber(pose.rotationY)
  );
}

export function sessionPoseOf(snapshot: GameRuntimeSnapshot, userId: string): SessionPose | null {
  const pose = snapshot.players[userId]?.session?.pose;
  return isSessionPose(pose) ? pose : null;
}

export const setSessionPoseCommand: CommandDef = {
  scope: (_input, actorUserId) => ({ players: [actorUserId], chunkKeys: [] }),
  validate: (snapshot, input, actorUserId) => {
    if (snapshot.players[actorUserId] === undefined) return { reason: "not_a_member" };
    if (!isSessionPose(input)) return { reason: "invalid_pose" };
    return null;
  },
  apply: (snapshot, input, actorUserId) => {
    const player = snapshot.players[actorUserId];
    if (player === undefined || !isSessionPose(input)) return snapshot;
    return markPlayerDirty(
      {
        ...snapshot,
        players: {
          ...snapshot.players,
          [actorUserId]: {
            ...player,
            session: {
              ...player.session,
              pose: { x: input.x, y: input.y, z: input.z, rotationY: input.rotationY },
            },
          },
        },
      },
      actorUserId,
    );
  },
};
