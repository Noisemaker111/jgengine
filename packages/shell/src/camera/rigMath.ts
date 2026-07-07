import type {
  CameraKeyframe,
  ChaseCameraConfig,
  LockOnCameraConfig,
  ObserverCameraConfig,
  ShoulderCameraConfig,
  TopDownCameraConfig,
} from "@jgengine/core/game/playableGame";

import { lerpVec3, smoothBlend, type Vec3 } from "./orbitCameraMath";

export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, blend: number): number {
  return from + (to - from) * blend;
}

export function smoothstep(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function forwardVector(yaw: number): Vec3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

export function rightVector(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

export interface ResolvedTopDown {
  height: number;
  pitch: number;
  yaw: number;
  offset: Vec3;
  followSmoothing: number;
}

export function resolveTopDown(config: TopDownCameraConfig | undefined): ResolvedTopDown {
  return {
    height: config?.height ?? 18,
    pitch: config?.pitch ?? 1.02,
    yaw: config?.yaw ?? Math.PI / 4,
    offset: {
      x: config?.targetOffset?.x ?? 0,
      y: config?.targetOffset?.y ?? 0,
      z: config?.targetOffset?.z ?? 0,
    },
    followSmoothing: config?.followSmoothing ?? 8,
  };
}

/**
 * Camera pose for a fixed top-down / isometric rig. `pitch` is the elevation of
 * the camera→target ray above the ground (PI/2 = straight down); `yaw` is the
 * fixed azimuth (PI/4 reads isometric). Height sets zoom; horizontal boom is
 * derived so the look angle stays constant as height changes.
 */
export function topDownPose(follow: Vec3, resolved: ResolvedTopDown, fov: number): CameraPose {
  const lookAt: Vec3 = {
    x: follow.x + resolved.offset.x,
    y: follow.y + resolved.offset.y,
    z: follow.z + resolved.offset.z,
  };
  const pitch = clamp(resolved.pitch, 0.05, Math.PI / 2);
  const horizontal = resolved.height / Math.tan(pitch);
  return {
    position: {
      x: lookAt.x - Math.sin(resolved.yaw) * horizontal,
      y: lookAt.y + resolved.height,
      z: lookAt.z - Math.cos(resolved.yaw) * horizontal,
    },
    lookAt,
    fov,
  };
}

/** Exponential spring-arm approach toward a desired point (frame-rate independent). */
export function springArmStep(current: Vec3, desired: Vec3, damping: number, dt: number): Vec3 {
  return lerpVec3(current, desired, smoothBlend(dt, damping));
}

/** Speed→FOV curve: FOV climbs from base to max as speed rises to `speedForMax`. */
export function speedToFov(
  speed: number,
  curve: { base?: number; max?: number; speedForMax?: number } | undefined,
): number {
  const base = curve?.base ?? 55;
  const max = curve?.max ?? 78;
  const speedForMax = curve?.speedForMax ?? 24;
  if (speedForMax <= 0) return base;
  return lerp(base, max, clamp(speed / speedForMax, 0, 1));
}

/** Yaw that points from `from` toward `to` on the XZ plane (matches shell forward = (sin, cos)). */
export function yawTo(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Shortest signed angular delta from `a` to `b`, wrapped to (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Exponential yaw smoothing that respects wrap-around. */
export function smoothYaw(current: number, desired: number, speed: number, dt: number): number {
  return current + angleDelta(current, desired) * smoothBlend(dt, speed);
}

export interface ResolvedShoulder {
  shoulderOffset: number;
  heightOffset: number;
  distance: number;
  fov: number;
}

export function resolveShoulder(
  config: ShoulderCameraConfig | undefined,
  aiming: boolean,
): ResolvedShoulder {
  const hip: ResolvedShoulder = {
    shoulderOffset: config?.shoulderOffset ?? 0.6,
    heightOffset: config?.heightOffset ?? 1.6,
    distance: config?.distance ?? 3.2,
    fov: config?.fov ?? 55,
  };
  if (!aiming) return hip;
  const ads = config?.ads;
  return {
    shoulderOffset: ads?.shoulderOffset ?? hip.shoulderOffset * 0.4,
    heightOffset: ads?.heightOffset ?? hip.heightOffset,
    distance: ads?.distance ?? hip.distance * 0.55,
    fov: ads?.fov ?? hip.fov * 0.75,
  };
}

/** Blend two shoulder framings by an ADS factor in [0,1]. */
export function blendShoulder(hip: ResolvedShoulder, ads: ResolvedShoulder, t: number): ResolvedShoulder {
  return {
    shoulderOffset: lerp(hip.shoulderOffset, ads.shoulderOffset, t),
    heightOffset: lerp(hip.heightOffset, ads.heightOffset, t),
    distance: lerp(hip.distance, ads.distance, t),
    fov: lerp(hip.fov, ads.fov, t),
  };
}

/**
 * Over-the-shoulder camera pose. The boom sits behind the follow point along
 * `yaw`, raised by `heightOffset`, and pushed sideways by `shoulderOffset`
 * (sign set by `sideSign`: +1 right, -1 left). `pitch` tilts the look point.
 */
export function shoulderPose(
  follow: Vec3,
  yaw: number,
  pitch: number,
  sideSign: number,
  shoulder: ResolvedShoulder,
): CameraPose {
  const forward = forwardVector(yaw);
  const right = rightVector(yaw);
  const anchor: Vec3 = {
    x: follow.x + right.x * shoulder.shoulderOffset * sideSign,
    y: follow.y + shoulder.heightOffset,
    z: follow.z + right.z * shoulder.shoulderOffset * sideSign,
  };
  const cosPitch = Math.cos(pitch);
  const position: Vec3 = {
    x: anchor.x - forward.x * shoulder.distance * cosPitch,
    y: anchor.y + Math.sin(pitch) * shoulder.distance,
    z: anchor.z - forward.z * shoulder.distance * cosPitch,
  };
  const lookAt: Vec3 = {
    x: anchor.x + forward.x * 4 * cosPitch,
    y: anchor.y - Math.sin(pitch) * 4,
    z: anchor.z + forward.z * 4 * cosPitch,
  };
  return { position, lookAt, fov: shoulder.fov };
}

/**
 * Lock-on pose: camera sits behind the player along the player→target vector so
 * the target stays framed. The look point is biased between player and target
 * by `framingBias`.
 */
export function lockOnPose(
  player: Vec3,
  target: Vec3,
  config: LockOnCameraConfig | undefined,
  fov: number,
): { pose: CameraPose; yaw: number } {
  const distance = config?.distance ?? 5;
  const height = config?.height ?? 2.4;
  const lookHeight = config?.lookHeight ?? 1.2;
  const bias = clamp(config?.framingBias ?? 0.5, 0, 1);
  const yaw = yawTo(player, target);
  const back = forwardVector(yaw);
  const focus: Vec3 = {
    x: lerp(player.x, target.x, bias),
    y: lerp(player.y, target.y, bias) + lookHeight,
    z: lerp(player.z, target.z, bias),
  };
  const position: Vec3 = {
    x: player.x - back.x * distance,
    y: player.y + height,
    z: player.z - back.z * distance,
  };
  return { pose: { position, lookAt: focus, fov }, yaw };
}

export interface ResolvedChase {
  distance: number;
  height: number;
  lookHeight: number;
  springDamping: number;
  shakePerSpeed: number;
}

export function resolveChase(config: ChaseCameraConfig | undefined): ResolvedChase {
  return {
    distance: config?.distance ?? 6,
    height: config?.height ?? 2.6,
    lookHeight: config?.lookHeight ?? 1.2,
    springDamping: config?.springDamping ?? 6,
    shakePerSpeed: config?.shakePerSpeed ?? 0,
  };
}

export interface ResolvedObserver {
  distance: number;
  height: number;
  lookHeight: number;
  orbitSpeed: number;
}

export function resolveObserver(config: ObserverCameraConfig | undefined): ResolvedObserver {
  return {
    distance: config?.distance ?? 8,
    height: config?.height ?? 3,
    lookHeight: config?.lookHeight ?? 1.2,
    orbitSpeed: config?.orbitSpeed ?? 0.2,
  };
}

/** Detached spectator pose: orbits `subject` at a fixed distance/height, never reading player input. */
export function observerPose(subject: Vec3, angle: number, resolved: ResolvedObserver, fov: number): CameraPose {
  const position: Vec3 = {
    x: subject.x + Math.sin(angle) * resolved.distance,
    y: subject.y + resolved.height,
    z: subject.z + Math.cos(angle) * resolved.distance,
  };
  return {
    position,
    lookAt: { x: subject.x, y: subject.y + resolved.lookHeight, z: subject.z },
    fov,
  };
}

/** Desired chase-camera position behind a vehicle facing `yaw` (before spring smoothing). */
export function chaseDesiredPosition(follow: Vec3, yaw: number, resolved: ResolvedChase): Vec3 {
  const back = forwardVector(yaw);
  return {
    x: follow.x - back.x * resolved.distance,
    y: follow.y + resolved.height,
    z: follow.z - back.z * resolved.distance,
  };
}

/** Look point ahead of / above a chased vehicle. */
export function chaseLookAt(follow: Vec3, yaw: number, resolved: ResolvedChase): Vec3 {
  const forward = forwardVector(yaw);
  return {
    x: follow.x + forward.x * 2,
    y: follow.y + resolved.lookHeight,
    z: follow.z + forward.z * 2,
  };
}

/** World-space seat pose (cockpit/hood/rear) rigidly attached to the vehicle. */
export function seatPose(
  follow: Vec3,
  yaw: number,
  local: { x?: number; y?: number; z?: number },
  fov: number,
): CameraPose {
  const forward = forwardVector(yaw);
  const right = rightVector(yaw);
  const lx = local.x ?? 0;
  const ly = local.y ?? 1.1;
  const lz = local.z ?? 0.2;
  const position: Vec3 = {
    x: follow.x + right.x * lx + forward.x * lz,
    y: follow.y + ly,
    z: follow.z + right.z * lx + forward.z * lz,
  };
  return {
    position,
    lookAt: { x: position.x + forward.x * 6, y: position.y, z: position.z + forward.z * 6 },
    fov,
  };
}

export interface TraumaState {
  trauma: number;
  time: number;
}

export function createTrauma(): TraumaState {
  return { trauma: 0, time: 0 };
}

/** Add trauma (0..1) and clamp; larger hits raise the ceiling toward 1. */
export function addTrauma(state: TraumaState, amount: number): void {
  state.trauma = clamp(state.trauma + amount, 0, 1);
}

/** Decay trauma linearly toward 0 and advance the shake clock. */
export function stepTrauma(state: TraumaState, decayPerSecond: number, dt: number): void {
  state.time += dt;
  state.trauma = clamp(state.trauma - decayPerSecond * dt, 0, 1);
}

function hashNoise(seed: number, time: number, frequency: number): number {
  const phase = time * frequency + seed * 12.9898;
  return Math.sin(phase) * 0.5 + Math.sin(phase * 2.137 + 1.7) * 0.5;
}

export interface ShakeOffset {
  x: number;
  y: number;
  roll: number;
}

/**
 * Positional + roll shake for the current trauma. Shake magnitude is
 * `trauma^exponent` so small hits stay subtle; the oscillation is deterministic
 * per-seed pseudo-noise (no per-frame RNG, so identical inputs reproduce).
 */
export function shakeOffset(
  state: TraumaState,
  config: {
    maxOffset?: number;
    maxRoll?: number;
    exponent?: number;
    frequency?: number;
  } | undefined,
): ShakeOffset {
  const maxOffset = config?.maxOffset ?? 0.5;
  const maxRoll = config?.maxRoll ?? 0.06;
  const exponent = config?.exponent ?? 2;
  const frequency = config?.frequency ?? 24;
  const shake = Math.pow(state.trauma, exponent);
  if (shake <= 0) return { x: 0, y: 0, roll: 0 };
  return {
    x: maxOffset * shake * hashNoise(1, state.time, frequency),
    y: maxOffset * shake * hashNoise(2, state.time, frequency),
    roll: maxRoll * shake * hashNoise(3, state.time, frequency),
  };
}

/** Linear cross-fade between two full camera poses (position, lookAt, fov). */
export function crossfadePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const blend = clamp(t, 0, 1);
  return {
    position: lerpVec3(from.position, to.position, blend),
    lookAt: lerpVec3(from.lookAt, to.lookAt, blend),
    fov: lerp(from.fov, to.fov, blend),
  };
}

export interface CinematicSample {
  pose: CameraPose;
  done: boolean;
}

/**
 * Sample a keyframe path at `elapsed` seconds. Each keyframe's `duration` is the
 * travel time from the previous keyframe into it; segment easing is per the
 * destination keyframe. Reports `done` once past the final keyframe (unless
 * looping, which wraps `elapsed` into the total path duration).
 */
export function cinematicSample(
  keyframes: readonly CameraKeyframe[],
  elapsed: number,
  loop: boolean,
  fallbackFov: number,
): CinematicSample {
  if (keyframes.length === 0) {
    const zero: Vec3 = { x: 0, y: 0, z: 0 };
    return { pose: { position: zero, lookAt: zero, fov: fallbackFov }, done: true };
  }
  const first = keyframes[0]!;
  const firstPose: CameraPose = {
    position: { ...first.position },
    lookAt: { ...first.lookAt },
    fov: first.fov ?? fallbackFov,
  };
  if (keyframes.length === 1) return { pose: firstPose, done: true };

  let total = 0;
  for (let i = 1; i < keyframes.length; i += 1) total += keyframes[i]!.duration ?? 1;
  if (total <= 0) return { pose: firstPose, done: true };

  let time = elapsed;
  let done = false;
  if (loop) {
    time = ((elapsed % total) + total) % total;
  } else if (elapsed >= total) {
    const last = keyframes[keyframes.length - 1]!;
    return {
      pose: { position: { ...last.position }, lookAt: { ...last.lookAt }, fov: last.fov ?? fallbackFov },
      done: true,
    };
  } else if (elapsed <= 0) {
    return { pose: firstPose, done: false };
  }

  let acc = 0;
  for (let i = 1; i < keyframes.length; i += 1) {
    const to = keyframes[i]!;
    const from = keyframes[i - 1]!;
    const duration = to.duration ?? 1;
    if (time <= acc + duration || i === keyframes.length - 1) {
      const localT = duration <= 0 ? 1 : clamp((time - acc) / duration, 0, 1);
      const eased = to.ease === "linear" ? localT : smoothstep(localT);
      const fromPose: CameraPose = {
        position: { ...from.position },
        lookAt: { ...from.lookAt },
        fov: from.fov ?? fallbackFov,
      };
      const toPose: CameraPose = {
        position: { ...to.position },
        lookAt: { ...to.lookAt },
        fov: to.fov ?? fallbackFov,
      };
      return { pose: crossfadePose(fromPose, toPose, eased), done };
    }
    acc += duration;
  }
  done = true;
  const last = keyframes[keyframes.length - 1]!;
  return {
    pose: { position: { ...last.position }, lookAt: { ...last.lookAt }, fov: last.fov ?? fallbackFov },
    done,
  };
}
