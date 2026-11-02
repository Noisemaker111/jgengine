import { useFrame, useThree } from "@react-three/fiber";
/**
 * Pushes local player pose to Convex on the R3F frame loop. Writes are
 * fire-and-forget — remote clients receive updates through reactive queries,
 * not mutation round-trips.
 */

import { useMemo, useState } from "react";
import { Euler } from "three";

import { createPoseSyncGate, type PoseSyncTuning } from "@jgengine/core/multiplayer/poseSyncGate";
import { useGameContext } from "@jgengine/react/provider";
import type { GameEngine } from "@/runtime/gameEngine";
import type { WorldPresenceActions } from "@/multiplayer/presenceTransport";

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
  presenceActions: WorldPresenceActions;
}

export function PresenceSyncController({ engine, playerId, enabled, presenceActions }: PresenceSyncControllerProps) {
  const [gate] = useState(() => createPoseSyncGate(POSE_SYNC_TUNING));
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const look = useMemo(() => new Euler(0, 0, 0, "YXZ"), []);

  useFrame(function presenceSync() {
    if (!enabled) return;

    // llmville-allow-engine-getstate-in-hooks: rAF latest-value read for Convex upload.
    const position = engine.getState().player.position;
    look.setFromQuaternion(camera.quaternion, "YXZ");
    const pose = {
      x: position.x,
      y: ctx.scene.entity.get(ctx.player.userId)?.position[1] ?? 0,
      z: position.z,
      rotationY: look.y,
      rotationPitch: look.x,
    };
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
