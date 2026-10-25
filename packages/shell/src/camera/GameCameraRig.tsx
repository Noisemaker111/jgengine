import { useCallback, useEffect, useRef, useSyncExternalStore, type ComponentType, type MutableRefObject } from "react";

import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
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
import { GameFirstPersonCamera, type ViewmodelProps } from "./GameFirstPersonCamera";
import { GameInspectionCamera } from "./GameInspectionCamera";
import { GameOrbitCamera } from "./GameOrbitCamera";
import { resolveDirectedCamera } from "./rigMath";
import { resolveCaptureCameraConfig, resolveRigKind, turntableAsObserver } from "./rigResolve";
import { CameraShakeApplier } from "./CameraShakeApplier";
import { rigShakeConfig, useCameraShake } from "./shakeChannel";

export { resolveRigKind } from "./rigResolve";

export interface GameCameraRigProps {
  yawRef: MutableRefObject<number>;
  pitchRef: MutableRefObject<number>;
  config?: GameCameraConfig;
  onDragChange?: (dragging: boolean) => void;
  pointerControls?: boolean;
  /** False when the game's own input map already claims WASD, so the RTS rig should stop panning on those keys. */
  panKeysEnabled?: boolean;
  /** False when the game's own input map already claims Q or E, so the RTS rig should stop rotating on those keys. */
  rotateKeysEnabled?: boolean;
  /** Runtime follow/cinematic override (#196.2). While present it wins over the static `config` for any field it reports non-`undefined`/non-`null`; absent (or an all-`undefined` snapshot) is a no-op. */
  director?: CameraDirector;
  /** Custom first-person viewmodel (#542); read only when the resolved rig is `"first"`. */
  viewmodel?: ComponentType<ViewmodelProps>;
}

export function GameCameraRig({
  yawRef,
  pitchRef,
  config,
  onDragChange,
  pointerControls,
  panKeysEnabled,
  rotateKeysEnabled,
  director,
  viewmodel,
}: GameCameraRigProps) {
  config = resolveCaptureCameraConfig(config, director?.rig());
  const shake = useCameraShake();
  const shakeConfig = config?.shake;
  useEffect(() => {
    shake.configure(rigShakeConfig(shakeConfig));
  }, [shake, shakeConfig?.maxOffset, shakeConfig?.maxRoll, shakeConfig?.decayPerSecond, shakeConfig?.exponent, shakeConfig?.frequency]);

  const directorVersionRef = useRef(0);
  const subscribeDirector = useCallback(
    (onStoreChange: () => void) => {
      if (director === undefined) return () => undefined;
      return director.subscribe(() => {
        directorVersionRef.current += 1;
        onStoreChange();
      });
    },
    [director],
  );
  const directorVersion = useCallback(() => directorVersionRef.current, []);
  useSyncExternalStore(subscribeDirector, directorVersion, directorVersion);

  const directed = resolveDirectedCamera(
    director === undefined
      ? undefined
      : { followEntityId: director.followedEntityId(), cinematic: director.cinematic() },
    { followEntityId: config?.followEntityId, cinematic: config?.cinematic },
  );
  const followEntityId = directed.followEntityId;

  const rig = (() => {
    if (directed.cinematic !== undefined) {
      // A director-set cinematic auto-clears when its keyframe path completes, so a
      // one-shot flyover can never strand the camera if a game-side clear timer drifts
      // (the rig plays in real time; sim-clock timers do not). Static config cinematics
      // hold their final frame as before.
      const owner = director !== undefined && director.cinematic() !== null ? director : undefined;
      return (
        <CinematicRig
          yawRef={yawRef}
          pitchRef={pitchRef}
          config={{ ...config, cinematic: directed.cinematic }}
          followEntityId={followEntityId}
          absoluteFov
          {...(owner === undefined ? {} : { onComplete: () => owner.setCinematic(null) })}
        />
      );
    }
    const kind = resolveRigKind(config);
    switch (kind) {
      case "first":
        return (
          <>
            <GameFirstPersonCamera
              yawRef={yawRef}
              pitchRef={pitchRef}
              config={config?.firstPerson}
              followEntityId={followEntityId ?? undefined}
              viewmodel={viewmodel}
              weapon={config?.weapon}
            />
            <CameraShakeApplier />
          </>
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
            rotateKeysEnabled={rotateKeysEnabled}
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
      case "turntable":
        return (
          <ObserverRig
            yawRef={yawRef}
            pitchRef={pitchRef}
            config={turntableAsObserver(config)}
            followEntityId={followEntityId}
          />
        );
      case "sideScroll":
        return <SideScrollRig yawRef={yawRef} pitchRef={pitchRef} config={config} followEntityId={followEntityId} />;
      case "inspection":
        return (
          <>
            <GameInspectionCamera config={config?.inspection} />
            <CameraShakeApplier />
          </>
        );
      case "none":
        return null;
      default:
        return (
          <>
            <GameOrbitCamera
              yawRef={yawRef}
              pitchRef={pitchRef}
              config={config}
              followEntityId={followEntityId ?? undefined}
              onCameraFollow={config?.onCameraFollow}
              onDragChange={onDragChange}
              pointerControls={pointerControls}
            />
            <CameraShakeApplier />
          </>
        );
    }
  })();

  return rig;
}
