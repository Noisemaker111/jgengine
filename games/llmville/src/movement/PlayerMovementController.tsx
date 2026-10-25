import { useFrame, useThree } from "@react-three/fiber";
import { PROFILE_SECTION, recordProfileSection } from "@/runtime/runtimePerformanceProfiler";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Euler, Vector3, type Camera } from "three";

import { readCameraLookForSlot, writeCameraLookForSlot } from "@/storage/storage";
import type { GameEngine } from "@/runtime/gameEngine";
import {
  advanceEyeHeight,
  advanceHeadBobTime,
  clampCameraPitch,
  resolveCameraTrackingBlend,
  resolveHeadBobAmplitude,
  resolveHeadBobOffset,
  resolveHeadBobRate,
  resolveTargetEyeHeight,
} from "@jgengine/core/movement/cameraRig";
import {
  advancePlayerMotion,
  createPlayerMotionState,
  MOVEMENT_TUNING,
  resolveMovementIntent,
  type MovementKeysState,
} from "@jgengine/core/movement/movementModel";
import {
  consumeLookDeltas,
  DOM_EVENT,
  setJumpOffset,
  setLookPitch,
  setLookYaw,
} from "@/movement/movementInput";

interface PlayerMovementControllerProps {
  activeSlot: number;
  gameId: string;
  engine: GameEngine;
  movementKeys: MovementKeysState;
  playerSpeed: number;
  canMove: boolean;
  onStepPlayer: (deltaX: number, deltaZ: number) => void;
}

interface UseCameraLookPersistenceResult {
  applySavedLook: () => void;
  persistLook: () => void;
}

/**
 * Saves and restores the look direction (yaw/pitch) per save slot so re-entering
 * the world keeps the camera pointed where the player left it. Persisted on a
 * throttle while playing and flushed on unmount / page hide.
 */
function useCameraLookPersistence(activeSlot: number, gameId: string, camera: Camera): UseCameraLookPersistenceResult {
  const lookSnapshotRef = useRef(readCameraLookForSlot(activeSlot, gameId));
  const lookStateRef = useRef({ yaw: 0, pitch: 0, lastPersistedAt: 0, initialized: false });
  const lookEulerRef = useRef(new Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    lookSnapshotRef.current = readCameraLookForSlot(activeSlot, gameId);
    lookStateRef.current = { yaw: 0, pitch: 0, lastPersistedAt: 0, initialized: false };
  }, [activeSlot, gameId]);

  useEffect(() => {
    const flushLook = () => {
      writeCameraLookForSlot(activeSlot, gameId, {
        yaw: lookStateRef.current.yaw,
        pitch: lookStateRef.current.pitch,
      });
    };

    window.addEventListener(DOM_EVENT.beforeUnload, flushLook);
    return () => {
      window.removeEventListener(DOM_EVENT.beforeUnload, flushLook);
      flushLook();
    };
  }, [activeSlot, gameId]);

  const applySavedLook = useCallback(() => {
    if (lookStateRef.current.initialized) return;

    const savedLook = lookSnapshotRef.current;
    if (savedLook !== null) {
      camera.rotation.order = "YXZ";
      camera.rotation.y = savedLook.yaw;
      camera.rotation.x = clampCameraPitch(savedLook.pitch);
      camera.rotation.z = 0;
    }

    lookStateRef.current.initialized = true;
  }, [camera]);

  const persistLook = useCallback(() => {
    lookEulerRef.current.setFromQuaternion(camera.quaternion, "YXZ");
    lookStateRef.current.yaw = lookEulerRef.current.y;
    lookStateRef.current.pitch = clampCameraPitch(lookEulerRef.current.x);

    const now = Date.now();
    if (now - lookStateRef.current.lastPersistedAt < 1_000) return;
    lookStateRef.current.lastPersistedAt = now;

    writeCameraLookForSlot(activeSlot, gameId, {
      yaw: lookStateRef.current.yaw,
      pitch: lookStateRef.current.pitch,
    });
  }, [activeSlot, camera, gameId]);

  return { applySavedLook, persistLook };
}

/**
 * First-person player controller. Each frame it converts the held movement keys
 * into a camera-relative velocity, integrates acceleration / friction / gravity,
 * asks the engine to commit the horizontal step (which resolves collisions), and
 * drives the camera position with eye-height crouch blending and head bob.
 *
 * The camera and the next step both read the engine's live position
 * (`engine.getState()`) inside the frame loop rather than the React-subscribed
 * prop. That keeps walking frame-accurate even when the per-frame position
 * dispatch can't trigger a React commit in time — otherwise every frame would
 * re-step from the same stale position and the avatar would stutter/rubber-band
 * back instead of crossing the room.
 *
 * Walking is gated only by `canMove` (derived from whether the world is in play),
 * never by pointer-lock — looking around and walking are independent.
 */
export function PlayerMovementController({
  activeSlot,
  gameId,
  engine,
  movementKeys,
  playerSpeed,
  canMove,
  onStepPlayer,
}: PlayerMovementControllerProps) {
  const { camera } = useThree();
  const { applySavedLook, persistLook } = useCameraLookPersistence(activeSlot, gameId, camera);
  const motionStateRef = useRef({
    ...createPlayerMotionState(),
    eyeHeight: MOVEMENT_TUNING.standEyeHeight as number,
    headBobTime: 0,
    cameraInitialized: false,
  });

  // Apply look deltas produced by the centralized first-person input (movementInput.ts).
  // All mouse-look mutation for desktop happens here.
  const vectors = useMemo(
    () => ({
      forward: new Vector3(),
      targetCameraPosition: new Vector3(),
      smoothedCameraPosition: new Vector3(),
    }),
    [],
  );

  useFrame((_state, rawDeltaSeconds) => {
    const startedAt = performance.now();
    const deltaSeconds = Math.min(rawDeltaSeconds, MOVEMENT_TUNING.maxFrameSeconds);
    const motion = motionStateRef.current;
    applySavedLook();

    // Consume any look deltas from centralized input (mousemove while locked).
    const look = consumeLookDeltas();
    if (look.yaw || look.pitch) {
      const euler = new Euler(0, 0, 0, "YXZ");
      euler.setFromQuaternion(camera.quaternion);
      euler.y += look.yaw;
      euler.x += look.pitch;
      euler.x = clampCameraPitch(euler.x);
      euler.z = 0;
      camera.quaternion.setFromEuler(euler);
    }

    const intent = resolveMovementIntent(movementKeys, canMove);

    vectors.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const { stepX, stepZ } = advancePlayerMotion(
      motion,
      intent,
      vectors.forward.x,
      vectors.forward.z,
      playerSpeed,
      deltaSeconds,
    );
    if (Math.abs(stepX) > 1e-6 || Math.abs(stepZ) > 1e-6) {
      onStepPlayer(stepX, stepZ);
    }

    // Read the freshly-committed authoritative position straight from the engine
    // so the camera follows the avatar this frame, independent of React's render
    // cadence — the subscribed prop lags a commit behind and rubber-bands.
    const playerPosition =
      // llmville-allow-engine-getstate-in-hooks: rAF latest-value read, not a subscription.
      engine.getState().player.position;

    // Dev-only: expose the live position so the Playwright movement spec can
    // assert the avatar actually walks (and does not rubber-band). Stripped from
    // production builds by the import.meta.env.DEV guard.
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as { __llmvillePlayerPos?: { x: number; z: number } }).__llmvillePlayerPos = {
        x: playerPosition.x,
        z: playerPosition.z,
      };
    }

    const targetEyeHeight = resolveTargetEyeHeight(intent.crouching, motion.grounded);
    motion.eyeHeight = advanceEyeHeight(motion.eyeHeight, targetEyeHeight, deltaSeconds);

    const horizontalSpeed = Math.sqrt(
      motion.horizontalVelocityX * motion.horizontalVelocityX + motion.horizontalVelocityZ * motion.horizontalVelocityZ,
    );
    const moving = horizontalSpeed > MOVEMENT_TUNING.movingSpeedThreshold;
    const bobRate = resolveHeadBobRate(intent.crouching, intent.running);
    motion.headBobTime = advanceHeadBobTime(motion.headBobTime, moving, motion.grounded, bobRate, deltaSeconds);

    const bobAmplitude = resolveHeadBobAmplitude(intent.crouching, intent.running, motion.grounded);
    const headBobOffset = resolveHeadBobOffset(motion.headBobTime, bobAmplitude);

    vectors.targetCameraPosition.set(
      playerPosition.x,
      motion.eyeHeight + motion.jumpOffset + headBobOffset,
      playerPosition.z,
    );

    if (!motion.cameraInitialized) {
      vectors.smoothedCameraPosition.copy(vectors.targetCameraPosition);
      motion.cameraInitialized = true;
    }

    const cameraBlend = resolveCameraTrackingBlend(deltaSeconds);
    vectors.smoothedCameraPosition.lerp(vectors.targetCameraPosition, cameraBlend);
    camera.position.copy(vectors.smoothedCameraPosition);

    const lookEuler = new Euler(0, 0, 0, "YXZ");
    lookEuler.setFromQuaternion(camera.quaternion);
    setLookYaw(lookEuler.y);
    setLookPitch(lookEuler.x);
    setJumpOffset(motion.jumpOffset);

    persistLook();
    recordProfileSection(PROFILE_SECTION.movementPlayer, performance.now() - startedAt);
  });

  return null;
}
