/**
 * Camera-rig feel math: the pure per-frame computations behind the first-person
 * camera (eye-height crouch blending, head bob, tracking smoothing, pitch
 * clamping). Kept alongside movementModel.ts so a renderer-side controller can
 * apply the results to its own three.js camera/vectors without owning the math.
 */

import { MOVEMENT_TUNING } from "./movementModel";

export const CAMERA_PITCH_LIMIT = 1.45;

export function clampCameraPitch(pitch: number): number {
  return Math.max(-CAMERA_PITCH_LIMIT, Math.min(CAMERA_PITCH_LIMIT, pitch));
}

export function resolveTargetEyeHeight(crouching: boolean, grounded: boolean): number {
  return crouching && grounded ? MOVEMENT_TUNING.crouchEyeHeight : MOVEMENT_TUNING.standEyeHeight;
}

export function advanceEyeHeight(currentEyeHeight: number, targetEyeHeight: number, deltaSeconds: number): number {
  const blend = 1 - Math.exp(-MOVEMENT_TUNING.crouchTransitionSpeed * deltaSeconds);
  return currentEyeHeight + (targetEyeHeight - currentEyeHeight) * blend;
}

export function resolveHeadBobRate(crouching: boolean, running: boolean): number {
  return crouching
    ? MOVEMENT_TUNING.crouchBobRate
    : running
      ? MOVEMENT_TUNING.runBobRate
      : MOVEMENT_TUNING.walkBobRate;
}

export function resolveHeadBobAmplitude(crouching: boolean, running: boolean, grounded: boolean): number {
  if (!grounded) return 0;
  return crouching
    ? MOVEMENT_TUNING.crouchBobAmplitude
    : running
      ? MOVEMENT_TUNING.runBobAmplitude
      : MOVEMENT_TUNING.walkBobAmplitude;
}

export function advanceHeadBobTime(
  currentHeadBobTime: number,
  moving: boolean,
  grounded: boolean,
  bobRate: number,
  deltaSeconds: number,
): number {
  return moving && grounded ? currentHeadBobTime + deltaSeconds * bobRate : 0;
}

export function resolveHeadBobOffset(headBobTime: number, bobAmplitude: number): number {
  return Math.sin(headBobTime * Math.PI * 2) * bobAmplitude;
}

export function resolveCameraTrackingBlend(deltaSeconds: number): number {
  return 1 - Math.exp(-MOVEMENT_TUNING.cameraTrackingSpeed * deltaSeconds);
}
