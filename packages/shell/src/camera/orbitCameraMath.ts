/** Horizontal facing derived from an orbit camera orbiting a target on the XZ plane. */
export function orbitYawFromCamera(
  cameraX: number,
  cameraZ: number,
  targetX: number,
  targetZ: number,
): number {
  const dx = targetX - cameraX;
  const dz = targetZ - cameraZ;
  return Math.atan2(dx, dz);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraFollowState {
  entityId: string;
  target: Vec3;
  camera: Vec3;
  distance: number;
}

export interface OrbitCameraConfig {
  minDistance?: number;
  maxDistance?: number;
  targetHeight?: number;
  initialDistance?: number;
  initialHeight?: number;
  /** Extra offset applied on top of entity position for the orbit target. */
  targetOffset?: Partial<Vec3>;
  /** Keep orbit radius locked while the follow target moves. */
  followLock?: boolean;
  /** When false, orbit target stays fixed (cinematic / debug). Default true. */
  followEnabled?: boolean;
  /** Orbit drag sensitivity (lower = smoother). Default OrbitControls is 1. */
  rotateSpeed?: number;
  zoomSpeed?: number;
  /** Inertia decay while orbiting (lower = longer coast). */
  dampingFactor?: number;
  /** Exponential smoothing when the follow target moves. Higher = snappier. */
  targetSmoothing?: number;
  /** Faster target follow while orbiting (defaults to ~1.8× targetSmoothing). */
  dragTargetSmoothing?: number;
  /** Exponential smoothing when re-locking orbit distance. */
  distanceSmoothing?: number;
}

/** Fully resolved shell config after merging with DEFAULT_ORBIT_CAMERA. */
export interface ResolvedOrbitCameraConfig {
  minDistance: number;
  maxDistance: number;
  targetHeight: number;
  initialDistance: number;
  initialHeight: number;
  targetOffset?: Partial<Vec3>;
  followLock: boolean;
  followEnabled: boolean;
  rotateSpeed: number;
  zoomSpeed: number;
  dampingFactor: number;
  targetSmoothing: number;
  dragTargetSmoothing: number;
  distanceSmoothing: number;
}

export const DEFAULT_ORBIT_CAMERA: ResolvedOrbitCameraConfig = {
  minDistance: 4,
  maxDistance: 28,
  targetHeight: 1.2,
  initialDistance: 9,
  initialHeight: 5.5,
  followLock: true,
  followEnabled: true,
  rotateSpeed: 0.22,
  zoomSpeed: 0.45,
  dampingFactor: 0.035,
  targetSmoothing: 8,
  dragTargetSmoothing: 11,
  distanceSmoothing: 5,
};

/** Run simulation/movement before orbit follow so poses are current. */
export const GAME_SIM_FRAME_PRIORITY = 0;
/** Orbit follow reads the latest entity pose after GAME_SIM_FRAME_PRIORITY. */
export const ORBIT_CAMERA_FRAME_PRIORITY = -1;

export interface OrbitFollowRuntimeState {
  target: Vec3;
  camera: Vec3;
  lockedDistance: number | null;
}

/** Frame-rate independent exponential smoothing factor in [0, 1]. */
export function smoothBlend(deltaSeconds: number, speed: number): number {
  return 1 - Math.exp(-speed * deltaSeconds);
}

export function resolveOrbitCameraConfig(patch?: OrbitCameraConfig): ResolvedOrbitCameraConfig {
  return { ...DEFAULT_ORBIT_CAMERA, ...patch };
}

export function resolveTargetSmoothing(config: ResolvedOrbitCameraConfig, dragging: boolean): number {
  if (dragging) {
    return config.dragTargetSmoothing;
  }
  return config.targetSmoothing;
}

export function resolveFollowTargetFromPosition(
  position: readonly [number, number, number],
  config: Pick<ResolvedOrbitCameraConfig, "targetHeight" | "targetOffset">,
): Vec3 {
  const offset = config.targetOffset;
  return {
    x: position[0] + (offset?.x ?? 0),
    y: position[1] + config.targetHeight + (offset?.y ?? 0),
    z: position[2] + (offset?.z ?? 0),
  };
}

export function lerpVec3(from: Vec3, to: Vec3, blend: number): Vec3 {
  return {
    x: from.x + (to.x - from.x) * blend,
    y: from.y + (to.y - from.y) * blend,
    z: from.z + (to.z - from.z) * blend,
  };
}

export function distanceBetween(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function seedOrbitFollowState(input: {
  entityPosition: readonly [number, number, number];
  config: Pick<ResolvedOrbitCameraConfig, "targetHeight" | "targetOffset" | "initialDistance" | "initialHeight">;
}): OrbitFollowRuntimeState {
  const target = resolveFollowTargetFromPosition(input.entityPosition, input.config);
  return {
    target,
    camera: {
      x: target.x,
      y: input.config.initialHeight,
      z: target.z - input.config.initialDistance,
    },
    lockedDistance: input.config.initialDistance,
  };
}

/**
 * Pure orbit follow step — smooth target tracking, camera carries target delta
 * (OrbitControls alone keeps camera fixed when only target moves), optional
 * distance lock. Call each frame before OrbitControls.update() in the shell.
 */
export function orbitFollowStep(input: {
  state: OrbitFollowRuntimeState;
  desiredTarget: Vec3;
  deltaSeconds: number;
  config: ResolvedOrbitCameraConfig;
  dragging: boolean;
}): OrbitFollowRuntimeState & { distance: number } {
  const target = { ...input.state.target };
  const camera = { ...input.state.camera };
  let lockedDistance = input.state.lockedDistance;

  const followEnabled = input.config.followEnabled !== false;
  const desiredTarget = followEnabled ? input.desiredTarget : target;

  const previousTarget = { ...target };
  const targetBlend = smoothBlend(input.deltaSeconds, resolveTargetSmoothing(input.config, input.dragging));
  const lerpedTarget = lerpVec3(target, desiredTarget, targetBlend);
  target.x = lerpedTarget.x;
  target.y = lerpedTarget.y;
  target.z = lerpedTarget.z;

  // OrbitControls preserves camera world position when only the target moves.
  camera.x += target.x - previousTarget.x;
  camera.y += target.y - previousTarget.y;
  camera.z += target.z - previousTarget.z;

  const followLock = input.config.followLock !== false;
  if (followLock && !input.dragging && lockedDistance !== null) {
    const currentDistance = distanceBetween(camera, target);
    if (currentDistance > 0.0001) {
      const scale = lockedDistance / currentDistance;
      const idealCamera: Vec3 = {
        x: target.x + (camera.x - target.x) * scale,
        y: target.y + (camera.y - target.y) * scale,
        z: target.z + (camera.z - target.z) * scale,
      };
      const distanceBlend = smoothBlend(input.deltaSeconds, input.config.distanceSmoothing);
      const smoothedCamera = lerpVec3(camera, idealCamera, distanceBlend);
      camera.x = smoothedCamera.x;
      camera.y = smoothedCamera.y;
      camera.z = smoothedCamera.z;
    }
  }

  if (!input.dragging) {
    lockedDistance = distanceBetween(camera, target);
  }

  return { target, camera, lockedDistance, distance: distanceBetween(camera, target) };
}

/** @deprecated Use orbitFollowStep — kept for older call sites. */
export function cameraFollowStep(input: {
  camera: Vec3;
  target: Vec3;
  previousTarget: Vec3 | null;
  lockedDistance: number | null;
}): CameraFollowState {
  const state: OrbitFollowRuntimeState = {
    target: input.previousTarget ?? input.target,
    camera: input.camera,
    lockedDistance: input.lockedDistance,
  };
  const stepped = orbitFollowStep({
    state,
    desiredTarget: input.target,
    deltaSeconds: 1,
    config: { ...DEFAULT_ORBIT_CAMERA, targetSmoothing: 1000, distanceSmoothing: 1000 },
    dragging: false,
  });
  return { entityId: "", target: stepped.target, camera: stepped.camera, distance: stepped.distance };
}