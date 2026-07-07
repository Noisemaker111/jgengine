import { useMemo, type MutableRefObject } from "react";

import type { CameraRigKind, GameCameraConfig } from "@jgengine/core/game/playableGame";

import {
  ChaseRig,
  CinematicRig,
  LockOnRig,
  RtsRig,
  ShoulderRig,
  TopDownRig,
} from "./cameraRigs";
import { GameFirstPersonCamera } from "./GameFirstPersonCamera";
import { GameOrbitCamera } from "./GameOrbitCamera";
import { CameraShakeContext, createCameraShakeChannel } from "./shakeChannel";

export interface GameCameraRigProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: GameCameraConfig;
  onDragChange?: (dragging: boolean) => void;
}

export function resolveRigKind(config: GameCameraConfig | undefined): CameraRigKind {
  if (config?.rig !== undefined) return config.rig;
  if (config?.perspective === "first") return "first";
  return "orbit";
}

export function GameCameraRig({ yawRef, pitchRef, config, onDragChange }: GameCameraRigProps) {
  const channel = useMemo(
    () => createCameraShakeChannel(config?.shake?.decayPerSecond),
    [config?.shake?.decayPerSecond],
  );
  const followEntityId = config?.followEntityId;

  const rig = (() => {
    if (config?.cinematic !== undefined) {
      return <CinematicRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
    }
    const kind = resolveRigKind(config);
    switch (kind) {
      case "first":
        return (
          <GameFirstPersonCamera
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={config?.firstPerson}
            followEntityId={followEntityId ?? undefined}
          />
        );
      case "topDown":
        return <TopDownRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "rts":
        return <RtsRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "shoulder":
        return <ShoulderRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "lockOn":
        return <LockOnRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "chase":
        return <ChaseRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      default:
        return (
          <GameOrbitCamera
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={config}
            followEntityId={followEntityId ?? undefined}
            onCameraFollow={config?.onCameraFollow}
            onDragChange={onDragChange}
          />
        );
    }
  })();

  return <CameraShakeContext.Provider value={channel}>{rig}</CameraShakeContext.Provider>;
}
