import { useEffect, useMemo, useReducer, type MutableRefObject } from "react";

import type { CameraRigKind, GameCameraConfig } from "@jgengine/core/game/playableGame";
import type { CameraDirector } from "@jgengine/core/runtime/cameraDirector";

import {
  ChaseRig,
  CinematicRig,
  LockOnRig,
  ObserverRig,
  RtsRig,
  ShoulderRig,
  SideScrollRig,
  TopDownRig,
} from "./cameraRigs";
import { GameFirstPersonCamera } from "./GameFirstPersonCamera";
import { GameInspectionCamera } from "./GameInspectionCamera";
import { GameOrbitCamera } from "./GameOrbitCamera";
import { resolveDirectedCamera } from "./rigMath";
import { CameraShakeContext, createCameraShakeChannel } from "./shakeChannel";

export interface GameCameraRigProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: GameCameraConfig;
  onDragChange?: (dragging: boolean) => void;
  pointerControls?: boolean;
  /** False when the game's own input map already claims WASD, so the RTS rig should stop panning on those keys. */
  panKeysEnabled?: boolean;
  /** Runtime follow/cinematic override (#196.2). While present it wins over the static `config` for any field it reports non-`undefined`/non-`null`; absent (or an all-`undefined` snapshot) is a no-op. */
  director?: CameraDirector;
}

/**
 * Resolves which rig mounts from a `GameCameraConfig`. Precedence, most to
 * least specific: an explicit `rig` field always wins; then `perspective:
 * "first"` (the historical shorthand for `rig: "orbit" | "first"`); then the
 * mere presence of a rig's own config block selects that rig, checked in the
 * fixed order below (#207.8) so a config carrying more than one block resolves
 * deterministically instead of depending on object key order. Set `rig`
 * explicitly to break a tie when a config legitimately needs more than one
 * block present (e.g. tuning a fallback rig's block ahead of time).
 */
export function resolveRigKind(config: GameCameraConfig | undefined): CameraRigKind {
  if (config?.rig !== undefined) return config.rig;
  if (config?.perspective === "first") return "first";
  if (config?.topDown !== undefined) return "topDown";
  if (config?.rts !== undefined) return "rts";
  if (config?.shoulder !== undefined) return "shoulder";
  if (config?.lockOn !== undefined) return "lockOn";
  if (config?.chase !== undefined) return "chase";
  if (config?.observer !== undefined) return "observer";
  if (config?.sideScroll !== undefined) return "sideScroll";
  if (config?.inspection !== undefined) return "inspection";
  return "orbit";
}

export function GameCameraRig({
  yawRef,
  pitchRef,
  config,
  onDragChange,
  pointerControls,
  panKeysEnabled,
  director,
}: GameCameraRigProps) {
  const channel = useMemo(
    () => createCameraShakeChannel(config?.shake?.decayPerSecond),
    [config?.shake?.decayPerSecond],
  );

  const [, notifyDirectorChange] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (director === undefined) return undefined;
    return director.subscribe(notifyDirectorChange);
  }, [director]);

  const directed = resolveDirectedCamera(
    director === undefined
      ? undefined
      : { followEntityId: director.followedEntityId(), cinematic: director.cinematic() },
    { followEntityId: config?.followEntityId, cinematic: config?.cinematic },
  );
  const followEntityId = directed.followEntityId;

  const rig = (() => {
    if (directed.cinematic !== undefined) {
      return (
        <CinematicRig
          yawRef={yawRef}
          pitchRef={pitchRef}
          config={{ ...config, cinematic: directed.cinematic }}
          followEntityId={followEntityId}
        />
      );
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
        return (
          <RtsRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={config}
            followEntityId={followEntityId}
            panKeysEnabled={panKeysEnabled}
          />
        );
      case "shoulder":
        return <ShoulderRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "lockOn":
        return <LockOnRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "chase":
        return <ChaseRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "observer":
        return <ObserverRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "sideScroll":
        return <SideScrollRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "inspection":
        return <GameInspectionCamera config={config?.inspection} />;
      case "none":
        return null;
      default:
        return (
          <GameOrbitCamera
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={config}
            followEntityId={followEntityId ?? undefined}
            onCameraFollow={config?.onCameraFollow}
            onDragChange={onDragChange}
            pointerControls={pointerControls}
          />
        );
    }
  })();

  return <CameraShakeContext.Provider value={channel}>{rig}</CameraShakeContext.Provider>;
}
