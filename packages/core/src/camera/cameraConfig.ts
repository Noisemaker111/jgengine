import type { GameContext } from "../runtime/gameContext";
import type { CameraRigShakeConfig } from "./shake/cameraShake";
import type { WeaponHandlingFrame } from "../combat/weaponHandling";
import type { WeaponPresentationTuning } from "../combat/weaponPresentation";

export interface CameraFollowState {
  entityId: string;
  target: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  distance: number;
}

export interface CameraWeaponView {
  handling: WeaponHandlingFrame;
  presentation?: WeaponPresentationTuning;
}

export interface FirstPersonCameraConfig {
  eyeHeight?: number;
  /** Mouse-look radians per pixel of pointer movement. Default 0.0025. */
  sensitivity?: number;
  /** Clamp on look pitch in radians (± from horizon). Default 1.45. */
  maxPitch?: number;
  reticle?: boolean;
  /**
   * Draw the player's own body instead of hiding it: a humanoid body keeps its arms, hands and held
   * items in view with its head folded away, so the camera never looks through the skull. Pair it
   * with `viewmodel: false`. A body the skeleton standard cannot map is drawn whole. Default false.
   */
  body?: boolean;
  /** Render a viewmodel in view: the built-in three-mesh gun, or `PlayableGame.viewmodel` when set (#542). `false` renders no viewmodel regardless of `PlayableGame.viewmodel`. Default true. */
  viewmodel?: boolean;
  /**
   * Keep the eye out of world collision. The boom anchors `armBack` behind the eye and
   * pulls the camera toward it so the near plane stays clear of a trunk or wall the body
   * can reach; pulling in is immediate, easing back out is not. `false` restores the
   * unchecked camera. Default on, with `clearance` = near plane + 0.15.
   */
  collision?: false | FirstPersonCollisionConfig;
}

export interface FirstPersonCollisionConfig {
  /** Gap kept between the camera and the surface it would enter, world units. Defaults to the near plane plus 0.15. */
  clearance?: number;
  armBack?: number;
}

/**
 * Which camera rig the shell mounts. Every rig accepts `followEntityId: null`
 * (avatar-less games — city-builders, card games, auto-battlers — still get a
 * camera). Rigs are tuned through their config block below, never by writing
 * camera positions from `onTick`.
 * - `orbit` — third-person chase (the historical default; `perspective: "third"`).
 * - `first` — pointer-lock mouse-look (`perspective: "first"`).
 * - `topDown` — fixed height/pitch/yaw with decoupled follow (ARPG iso, top-down).
 * - `rts` — free-pan / edge-scroll / rotate / zoom, optional follow.
 * - `shoulder` — over-the-shoulder with ADS transition + shoulder swap.
 * - `lockOn` — yaw bound to the player→target vector; move axis becomes strafe.
 * - `chase` — speed-reactive vehicle chase (speed→FOV, spring arm, shake) + cockpit/hood/rear views.
 * - `observer` — detached spectator/photo cam bound to any entity or fixed point; never reads player input.
 * - `turntable` — slow auto-orbit of a fixed point: a rotating display stand for a scene. The friendly, flat spelling of `observer`'s point-orbit mode; providing `camera.turntable` selects it without an explicit `rig`.
 * - `sideScroll` — fixed lateral follow (2.5D platformer/beat-'em-up side view); reads no player input.
 * - `inspection` — model-viewer / editor rig (#207.7, #866): middle-drag pan, right-drag orbit, scroll zoom toward a configurable anchor; orbits a fixed point, reads no player/entity input.
 * - `none` — no camera rig is mounted; use for HUD-only presentations or a game that manages its own camera.
 */
export type CameraRigKind =
  | "orbit"
  | "first"
  | "topDown"
  | "rts"
  | "shoulder"
  | "lockOn"
  | "chase"
  | "observer"
  | "turntable"
  | "sideScroll"
  | "inspection"
  | "none";

export type CameraProjection = "perspective" | "orthographic";

/** Pixel-art orthographic camera tuning. `pixelsPerUnit` is the authored pixel density. */
export interface PixelPerfectCameraConfig {
  pixelsPerUnit: number;
  integerScale?: boolean;
}

/** Fixed lateral 2.5D follow (side-on platformer cam): the camera sits perpendicular to the travel axis, tracks the followed entity, and never reads player look input. */
export interface SideScrollCameraConfig {
  axis?: "x" | "z";
  distance?: number;
  height?: number;
  lookHeight?: number;
  /** Per-second smoothing factor for the follow (0 hard-locks). Default 8. */
  followSmoothing?: number;
  fov?: number;
}

export interface TopDownCameraConfig {
  height?: number;
  /** Elevation of the camera above the ground plane in radians (PI/2 = straight down, near 0 = grazing; values below 0.05 clamp to 0.05). Default ~1.02 (~58°, ARPG iso). */
  pitch?: number;
  /** Fixed azimuth in radians; ~PI/4 reads as isometric, 0 as straight top-down. Default PI/4. */
  yaw?: number;
  targetOffset?: { x?: number; y?: number; z?: number };
  followSmoothing?: number;
  zoom?: { min?: number; max?: number; speed?: number };
}

export interface RtsCameraConfig extends TopDownCameraConfig {
  /** WASD / arrow pan speed in world units per second. Default 24. */
  panSpeed?: number;
  edgeScroll?: boolean | { margin?: number; speed?: number };
  /** Yaw rotate speed (radians/sec) for rotate keys / middle-drag. Default 1.4. */
  rotateSpeed?: number;
  /** World-space clamp for the pan center. */
  bounds?: { minX?: number; maxX?: number; minZ?: number; maxZ?: number };
  start?: { x?: number; z?: number };
  pan?: boolean;
}

export interface ShoulderCameraConfig {
  shoulderOffset?: number;
  heightOffset?: number;
  distance?: number;
  side?: "left" | "right";
  ads?: { distance?: number; shoulderOffset?: number; fov?: number; heightOffset?: number };
  adsTransitionSpeed?: number;
  /** Screen-space reticle offset (fraction of viewport), decoupled from camera center. */
  reticleOffset?: { x?: number; y?: number };
  /** Mouse-look sensitivity (radians per pixel). Default 0.0025. */
  sensitivity?: number;
  fov?: number;
}

export interface LockOnCameraConfig {
  /** Target instance id; when omitted the rig reads the follower's current `getTarget`. */
  targetEntityId?: string;
  distance?: number;
  height?: number;
  lookHeight?: number;
  framingBias?: number;
  yawSmoothing?: number;
}

export type ChaseView = "chase" | "cockpit" | "hood" | "rear";

export interface ChaseCameraConfig {
  headingSource?: "body" | "input";
  distance?: number;
  height?: number;
  lookHeight?: number;
  springDamping?: number;
  fov?: { base?: number; max?: number; speedForMax?: number; response?: number };
  distanceBySpeed?: { extra: number; speedForMax?: number };
  /**
   * Tilt the boom with the target's body pitch (`rotationX`) so the camera stays behind it on
   * slopes and ramps. `blend` (default 1) is the fraction of the pitch followed, clamped to `max`
   * radians (default 0.6) and eased by `response` (default 5). Omit the block to keep a level boom.
   */
  pitchFollow?: { blend?: number; max?: number; response?: number };
  /** How `ctx.camera.kickFov(degrees)` impulses feel: the kick decays at `decay` per second (default 7) and the summed kick is clamped to `max` degrees (default 20). */
  fovKick?: { decay?: number; max?: number };
  lookBackAction?: string;
  /**
   * Pull the boom in past scene colliders, objects, terrain and walls via `ctx.scene.raycast`
   * (entities never block). `radius` (default 0.3) keeps the lens off the surface; `minDistance`
   * (default 0.8) is the closest the camera gets to the look pivot. Default on; `false` disables.
   */
  collision?: boolean | { radius?: number; minDistance?: number };
  shakePerSpeed?: number;
  /** Velocity-lead / predictive follow (#286.9): the rig aims `time` seconds ahead of the target along its velocity, clamped to `max` world units (default 4). */
  lead?: { time: number; max?: number };
  /** Roll into turns (#286.10): radians of camera roll per rad/s of the target's yaw rate, clamped to `max` (default 0.35), exponentially smoothed by `damping` (default 8). */
  bank?: { perYawRate: number; max?: number; damping?: number };
  /**
   * Drift-lag (#1051): when the target slides, rotate the chase anchor partway from
   * its heading toward its travel (velocity) direction so the player sees the car's
   * side while the framing stays stable. Omitting the block keeps the pure-heading
   * behavior. `blend` (default 0.65) is the max fraction of the slip angle to
   * follow, itself scaled by how far the slip has opened so straight-line driving
   * is untouched; below `minSpeed` (default 4) planar speed the feature is off for
   * parking-lot stability; reversing never swings the camera around. `response`
   * (default 6) drives `1-exp(-response*dt)` smoothing toward the blended yaw.
   */
  velocityYaw?: { blend?: number; minSpeed?: number; response?: number };
  /**
   * Exponential response (`1-exp(-response*dt)`) the chase yaw follows the target's facing with
   * (#1370). The default (5) arcs the boom smoothly behind a body whose facing flips from a strafe
   * or direction change instead of teleporting it to the far side; `Infinity` restores the legacy
   * rigid follow (yaw exactly equals body facing every frame).
   */
  yawResponse?: number;
  view?: ChaseView;
  seatOffsets?: {
    cockpit?: { x?: number; y?: number; z?: number };
    hood?: { x?: number; y?: number; z?: number };
    rear?: { x?: number; y?: number; z?: number };
  };
}

/** Detached spectator/photo cam (#120) — binds to any entity or fixed point, never reads player input. */
export interface ObserverCameraConfig {
  bind?: { kind: "entity"; entityId: string } | { kind: "point"; position: { x: number; y: number; z: number } };
  distance?: number;
  height?: number;
  lookHeight?: number;
  /** Radians/second of automatic orbit around the subject (CCTV-style sweep); 0 holds a fixed angle. Default 0.2. */
  orbitSpeed?: number;
  /** Starting orbit angle in radians. Default 0. */
  startAngle?: number;
  fov?: number;
}

/**
 * Turntable / showcase rig — slowly auto-orbits a fixed world point (no player
 * input), the way a museum turntable rotates an object on display. A flat,
 * self-describing spelling of `observer`'s point-orbit mode: `target` names the
 * point directly instead of `bind: { kind: "point", position }`. Set
 * `camera.turntable` and the rig is inferred — you don't also write `rig`.
 */
export interface TurntableCameraConfig {
  target?: { x: number; y: number; z: number };
  distance?: number;
  height?: number;
  lookHeight?: number;
  /** Radians/second of rotation; 0 holds a fixed angle. Default 0.2. */
  orbitSpeed?: number;
  /** Starting angle in radians. Default 0. */
  startAngle?: number;
  fov?: number;
}

/**
 * How scroll-zoom re-anchors the view for the inspection rig (#207.7):
 * - `target` — dolly toward the orbit target (classic OrbitControls behavior).
 * - `cursor` — dolly toward the point under the pointer.
 * - `center` — dolly toward the viewport center; equivalent to `target` for an
 *   OrbitControls-driven rig, since the camera always faces `target` and that
 *   point already projects to the exact center of the viewport.
 */
export type InspectionZoomAnchor = "target" | "cursor" | "center";

/** Model-viewer / inspection rig (#207.7) — orbit + pan + anchored zoom around a fixed point, never reads player input. */
export interface InspectionCameraConfig {
  anchor?: InspectionZoomAnchor;
  target?: { x?: number; y?: number; z?: number };
  initialDistance?: number;
  initialPosition?: { x?: number; y?: number; z?: number };
  minDistance?: number;
  maxDistance?: number;
  /** Vertical orbit clamp (radians). Unset allows a full pole-to-pole orbit, unlike the tighter default on the classic orbit rig. */
  minPolarAngle?: number;
  maxPolarAngle?: number;
  pan?: boolean;
  rotateSpeed?: number;
  zoomSpeed?: number;
  dampingFactor?: number;
}

export interface CameraKeyframe {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  fov?: number;
  /** Seconds to travel from the previous keyframe to this one. Default 1. */
  duration?: number;
  ease?: "linear" | "smooth";
}

export interface CinematicCameraConfig {
  keyframes: readonly CameraKeyframe[];
  /** Restart from the first keyframe after the last. Default false. */
  loop?: boolean;
}

export type { CameraRigShakeConfig };

export const CAMERA_FRUSTUM_DEFAULTS = { fov: 55, near: 0.1, far: 300, zoom: 50 } as const;

export interface PlayerFovConfig {
  min?: number;
  max?: number;
  /** Initial FOV when nothing is persisted. Defaults to `frustum.fov` or 55. */
  default?: number;
  persist?: boolean;
  control?: boolean;
}

export interface GameCameraLensConfig {
  projection?: CameraProjection;
  /** Pixel-perfect orthographic rendering; ignored for perspective cameras. */
  pixelPerfect?: PixelPerfectCameraConfig;
  /** Render frustum overrides applied to the canvas camera. `far` defaults to 300 — raise it for worlds whose content spans more than a few hundred units, or distant scenery silently clips. `zoom` is the orthographic zoom in canvas pixels per world unit, read only when `projection` is "orthographic"; default 50. */
  frustum?: { fov?: number; near?: number; far?: number; zoom?: number };
  playerFov?: PlayerFovConfig;
}

/** Per-rig tuning blocks; each is read only when its rig is selected. */
export interface GameCameraRigConfigs {
  firstPerson?: FirstPersonCameraConfig;
  topDown?: TopDownCameraConfig;
  rts?: RtsCameraConfig;
  shoulder?: ShoulderCameraConfig;
  lockOn?: LockOnCameraConfig;
  chase?: ChaseCameraConfig;
  /** Detached spectator/photo cam tuning (#120); read when `rig: "observer"`. */
  observer?: ObserverCameraConfig;
  turntable?: TurntableCameraConfig;
  sideScroll?: SideScrollCameraConfig;
  /** Model-viewer / inspection tuning (#207.7); read when `rig: "inspection"`. */
  inspection?: InspectionCameraConfig;
}

export interface GameCameraOrbitConfig {
  minDistance?: number;
  maxDistance?: number;
  targetHeight?: number;
  targetOffset?: { x?: number; y?: number; z?: number };
  initialDistance?: number;
  initialHeight?: number;
  /** Initial horizontal boom facing (radians): 0 = camera behind on -Z, PI = camera on +Z. Seeds orbit and input-owned chase once; unset keeps orbit's -Z placement or seeds chase from its first acquired target's heading. */
  initialYaw?: number;
  /** Initial boom elevation (radians): 0 = level, positive = camera above the target looking down. Seeds the orbit rig; unset derives elevation from `initialHeight`/`initialDistance`. */
  initialPitch?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  dampingFactor?: number;
  targetSmoothing?: number;
  dragTargetSmoothing?: number;
  distanceSmoothing?: number;
  /** Vertical look clamp (three.js polar angle, radians): 0 = top-down over the head, PI/2 = level, >PI/2 = look up from below. Widen for top-down or vertical aim; unset keeps the standard chase feel. */
  minPolarAngle?: number;
  maxPolarAngle?: number;
  /** Signed boom-elevation clamp `[min, max]` (radians): min < 0 dips the camera below the target, max > 0 rises overhead. Maps onto `minPolarAngle`/`maxPolarAngle` (polar = PI/2 − pitch); explicit polar fields win. */
  pitchClamp?: readonly [number, number];
  /** Spring-arm occlusion for the orbit rig: pull the camera in past walls/terrain so it never clips inside geometry. Off unless `enabled`. */
  collision?: { enabled?: boolean; padding?: number; minTargetDistance?: number };
}

export interface GameCameraFollowConfig {
  followLock?: boolean;
  followEnabled?: boolean;
  /** Instance id to follow, or null for an avatar-less free camera; defaults to local player in the dev shell. */
  followEntityId?: string | null;
  onCameraFollow?: (state: CameraFollowState) => void;
  /**
   * The followed entity's held weapon, read every frame by the `first` and `shoulder` rigs. Return the
   * weapon's `createWeaponHandling` frame and its presentation tuning, or `null` for none. First person
   * poses the viewmodel from it (offset, ADS pose, viewmodel FOV, sway, bob, kick) and adds the recoil to
   * the look; over-the-shoulder takes its ADS blend from `adsProgress` and adds the same recoil. `ctx` is
   * the running game, so the hook reads per-run weapon state rather than a module global.
   */
  weapon?: (entityId: string, ctx: GameContext) => CameraWeaponView | null;
}

export interface GameCameraConfig {
  rig?: CameraRigKind;
  /** @deprecated Legacy shorthand for `rig: "orbit" | "first"` — set `rig` instead. "third" mounts the orbit camera (default); "first" mounts pointer-lock mouse-look. */
  perspective?: "third" | "first";
  lens?: GameCameraLensConfig;
  rigs?: GameCameraRigConfigs;
  orbit?: GameCameraOrbitConfig;
  follow?: GameCameraFollowConfig;
  shake?: CameraRigShakeConfig;
  cinematic?: CinematicCameraConfig;
  /** Seconds to cross-fade the camera when the rig changes (#29). 0 hard-cuts. Default 0.6. */
  transitionSeconds?: number;
}
