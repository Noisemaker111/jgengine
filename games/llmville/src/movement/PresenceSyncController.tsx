/**
 * Pushes local player pose to Convex on the R3F frame loop. Writes are
 * fire-and-forget — remote clients receive updates through reactive queries,
 * not mutation round-trips.
 */

import { useState } from "react";

import { createPoseSyncGate, type PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import { PROFILE_SECTION, useProfiledFrame } from "@/runtime/runtimePerformanceProfiler";
import { readJumpOffset, readLookPitch, readLookYaw } from "@/movement/movementInput";
import type { GameEngine } from "@/runtime/gameEngine";
import type { PresenceActions } from "@/multiplayer/presenceTransport";

const POSE_SYNC_TUNING: PoseSyncTuning = {
  minIntervalMs: 100,
  heartbeatMs: 15_000,
  positionEpsilon: 0.012,
  verticalEpsilon: 0.008,
  rotationEpsilon: 0.008,
};

interface PresenceSyncControllerProps {
  engine: GameEngine;
  playerId: string;
  enabled: boolean;
  presenceActions: PresenceActions;
}

function readPlayerPose(engine: GameEngine) {
  const pos =
    // llmville-allow-engine-getstate-in-hooks: rAF latest-value read for Convex upload.
    engine.getState().player.position;
  return {
    x: pos.x,
    y: readJumpOffset(),
    z: pos.z,
    rotationY: readLookYaw(),
    rotationPitch: readLookPitch(),
  };
}

export function PresenceSyncController({ engine, playerId, enabled, presenceActions }: PresenceSyncControllerProps) {
  const [gate] = useState(() => createPoseSyncGate(POSE_SYNC_TUNING));

  useProfiledFrame(PROFILE_SECTION.movementPresence, () => {
    if (!enabled) return;

    const pose = readPlayerPose(engine);
    if (!gate.evaluate(pose, performance.now())) return;

    presenceActions.syncPose({
      position: { x: pose.x, y: pose.y, z: pose.z },
      rotationY: pose.rotationY,
      rotationPitch: pose.rotationPitch,
      externalId: playerId,
    });
  });

  return null;
}
