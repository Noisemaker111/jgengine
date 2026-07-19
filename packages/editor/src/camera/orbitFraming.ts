/**
 * Pure aerial-framing math for the editor orbit camera. `camera_goto`/`camera_frame` used to only
 * pan the orbit *target*, leaving distance and pitch wherever the artist last dragged them — so a
 * `KeyF` frame could bury the camera inside terrain or a building and composing a clean district
 * aerial took many guess-the-y-offset round-trips. These helpers turn an explicit
 * distance + pitch (+ optional yaw / height) into a camera position, and derive a fit-to-region
 * distance from document bounds so one call frames a whole district from above.
 *
 * Dependency-free and side-effect-free so it is trivially unit-testable and safe to import into the
 * R3F camera driver.
 */

const DEG_TO_RAD = Math.PI / 180;

/** A world-space point the orbit camera looks at. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounds as produced by `editorDocumentBounds`. */
export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

/** Inputs to {@link orbitCameraPosition}. */
export interface OrbitFrameInput {
  /** Point the camera orbits and looks at. */
  target: Vec3;
  /** Radial distance from target to camera, in world units. Clamped to a small positive minimum. */
  distance: number;
  /** Elevation above the horizon, degrees: 0 = level with the target, 90 = straight-down aerial. */
  pitchDeg: number;
  /** Azimuth around the target, degrees: 0 looks along +Z toward the target, increasing toward +X. */
  yawDeg?: number;
  /**
   * Explicit camera height above the target (world units). When set it overrides the pitch-derived
   * height, letting a caller pin a fixed altitude while pitch still sets the horizontal pull-back.
   */
  height?: number;
}

/** Smallest distance we will place the camera at, so `distance: 0` never collapses onto the target. */
const MIN_DISTANCE = 0.01;

/** Clamp a pitch to the horizon..straight-down range the orbit rig can express. */
export function clampPitchDeg(pitchDeg: number): number {
  if (!Number.isFinite(pitchDeg)) return 45;
  return Math.max(0, Math.min(90, pitchDeg));
}

/**
 * Camera position for an orbit rig framing `target` at the given distance, pitch, and yaw. Pitch is
 * measured up from the horizon (90° = directly overhead); `height`, when provided, replaces the
 * pitch-derived vertical offset. Pure: same inputs always yield the same position.
 */
export function orbitCameraPosition(input: OrbitFrameInput): Vec3 {
  const distance = Math.max(MIN_DISTANCE, Number.isFinite(input.distance) ? input.distance : MIN_DISTANCE);
  const pitchRad = clampPitchDeg(input.pitchDeg) * DEG_TO_RAD;
  const yawRad = (Number.isFinite(input.yawDeg) ? (input.yawDeg as number) : 0) * DEG_TO_RAD;
  const horizontal = distance * Math.cos(pitchRad);
  const vertical = distance * Math.sin(pitchRad);
  const height = input.height !== undefined && Number.isFinite(input.height) ? input.height : vertical;
  return {
    x: input.target.x + horizontal * Math.sin(yawRad),
    y: input.target.y + height,
    z: input.target.z + horizontal * Math.cos(yawRad),
  };
}

/** Center point of axis-aligned bounds. */
export function boundsCenter(bounds: Bounds3): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

/** Options for {@link frameDistanceForBounds}. */
export interface FrameDistanceOptions {
  /** Vertical field of view of the camera, degrees. Default 50 (the shell's default perspective FOV). */
  fovDeg?: number;
  /** Extra breathing room around the region as a multiplier on its radius. Default 1.25. */
  margin?: number;
}

/**
 * Distance at which the camera fits the whole `bounds` region into its vertical FOV — the value
 * `camera_frame` uses when a caller asks for an aerial but does not pin an explicit distance, so a
 * district frames itself instead of burying the camera. Uses the region's XZ half-diagonal plus its
 * vertical extent as the radius to cover.
 */
export function frameDistanceForBounds(bounds: Bounds3, options: FrameDistanceOptions = {}): number {
  const fovDeg = clampFovDeg(options.fovDeg ?? 50);
  const margin = options.margin !== undefined && Number.isFinite(options.margin) ? options.margin : 1.25;
  const halfX = (bounds.max.x - bounds.min.x) / 2;
  const halfZ = (bounds.max.z - bounds.min.z) / 2;
  const halfY = (bounds.max.y - bounds.min.y) / 2;
  const radius = Math.hypot(halfX, halfZ) + Math.max(0, halfY);
  const halfFovRad = (fovDeg / 2) * DEG_TO_RAD;
  const tan = Math.tan(halfFovRad);
  const distance = tan > 1e-4 ? (radius * Math.max(0.1, margin)) / tan : radius;
  return Math.max(MIN_DISTANCE, distance);
}

function clampFovDeg(fovDeg: number): number {
  if (!Number.isFinite(fovDeg)) return 50;
  return Math.max(1, Math.min(179, fovDeg));
}
