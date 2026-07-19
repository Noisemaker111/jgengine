export interface CameraFollowState {
  entityId: string;
  target: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  distance: number;
}

export interface FirstPersonCameraConfig {
  /** Camera height above the followed entity's origin. Default 1.6. */
  eyeHeight?: number;
  /** Mouse-look radians per pixel of pointer movement. Default 0.0025. */
  sensitivity?: number;
  /** Clamp on look pitch in radians (± from horizon). Default 1.45. */
  maxPitch?: number;
  /** Show the centered crosshair overlay. Default true. */
  reticle?: boolean;
  /** Render a viewmodel in view: the built-in three-mesh gun, or `PlayableGame.viewmodel` when set (#542). `false` renders no viewmodel regardless of `PlayableGame.viewmodel`. Default true. */
  viewmodel?: boolean;
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

/** Canvas camera projection. "orthographic" renders a flat 2D-style view (side-scrollers, falling-block puzzles) — pair with `rig: "sideScroll"`; default "perspective". */
export type CameraProjection = "perspective" | "orthographic";

/** Fixed lateral 2.5D follow (side-on platformer cam): the camera sits perpendicular to the travel axis, tracks the followed entity, and never reads player look input. */
export interface SideScrollCameraConfig {
  /** World axis the action travels along; the camera watches from the perpendicular side. Default "x". */
  axis?: "x" | "z";
  /** Camera distance from the followed entity along the perpendicular axis. Default 10. */
  distance?: number;
  /** Camera height above the followed entity. Default 3. */
  height?: number;
  /** Height of the look point above the entity. Default 1. */
  lookHeight?: number;
  /** Per-second smoothing factor for the follow (0 hard-locks). Default 8. */
  followSmoothing?: number;
  fov?: number;
}

/** Fixed top-down / isometric rig (#23) — height/pitch/yaw + decoupled follow. */
export interface TopDownCameraConfig {
  /** Camera height above the follow point. Default 18. */
  height?: number;
  /** Elevation of the camera above the ground plane in radians (PI/2 = straight down, near 0 = grazing; values below 0.05 clamp to 0.05). Default ~1.02 (~58°, ARPG iso). */
  pitch?: number;
  /** Fixed azimuth in radians; ~PI/4 reads as isometric, 0 as straight top-down. Default PI/4. */
  yaw?: number;
  /** Horizontal look offset applied to the follow point. */
  targetOffset?: { x?: number; y?: number; z?: number };
  /** Exponential follow smoothing (higher = snappier, decoupled from any orbit drag). Default 8. */
  followSmoothing?: number;
  /** Scroll zoom bounds as a height multiplier. */
  zoom?: { min?: number; max?: number; speed?: number };
}

/** Free-pan / edge-scroll RTS rig (#24) — pan/rotate/zoom independent of any avatar. */
export interface RtsCameraConfig extends TopDownCameraConfig {
  /** WASD / arrow pan speed in world units per second. Default 24. */
  panSpeed?: number;
  /** Edge-scroll when the pointer nears a screen edge; number sets the margin fraction. Default true. */
  edgeScroll?: boolean | { margin?: number; speed?: number };
  /** Yaw rotate speed (radians/sec) for rotate keys / middle-drag. Default 1.4. */
  rotateSpeed?: number;
  /** World-space clamp for the pan center. */
  bounds?: { minX?: number; maxX?: number; minZ?: number; maxZ?: number };
  /** Start centered on this world point when there is no follow target. */
  start?: { x?: number; z?: number };
  /** Read WASD/arrow pan, edge-scroll, Q/E rotate, and wheel zoom. `false` sits static at the start/bounds position — a backdrop camera, no input at all. Default true. */
  pan?: boolean;
}

/** Over-the-shoulder combat rig (#25) — offset, ADS, shoulder swap, decoupled reticle. */
export interface ShoulderCameraConfig {
  /** Lateral shoulder offset (world units, sign flips on swap). Default 0.6. */
  shoulderOffset?: number;
  /** Vertical offset above the follow point. Default 1.6. */
  heightOffset?: number;
  /** Boom distance behind the shoulder. Default 3.2. */
  distance?: number;
  /** Starting shoulder side. Default "right". */
  side?: "left" | "right";
  /** Aim-down-sights framing, blended in while `aim` is held. */
  ads?: { distance?: number; shoulderOffset?: number; fov?: number; heightOffset?: number };
  /** ADS blend speed (higher = snappier). Default 10. */
  adsTransitionSpeed?: number;
  /** Screen-space reticle offset (fraction of viewport), decoupled from camera center. */
  reticleOffset?: { x?: number; y?: number };
  /** Mouse-look sensitivity (radians per pixel). Default 0.0025. */
  sensitivity?: number;
  /** Base field of view. Default 55. */
  fov?: number;
}

/** Lock-on / strafe rig (#26) — yaw bound to player→target, move axis becomes strafe. */
export interface LockOnCameraConfig {
  /** Target instance id; when omitted the rig reads the follower's current `getTarget`. */
  targetEntityId?: string;
  /** Boom distance behind the player, away from the target. Default 5. */
  distance?: number;
  /** Camera height above the follow point. Default 2.4. */
  height?: number;
  /** Height of the framed look point above the midpoint. Default 1.2. */
  lookHeight?: number;
  /** 0 frames the player, 1 frames the target, 0.5 the midpoint. Default 0.5. */
  framingBias?: number;
  /** Exponential yaw smoothing toward the player→target vector. Default 9. */
  yawSmoothing?: number;
}

/** Fixed interior view for the chase rig (#27). */
export type ChaseView = "chase" | "cockpit" | "hood" | "rear";

/** Speed-reactive vehicle chase rig (#27) — speed→FOV, spring arm, procedural shake, interior views. */
export interface ChaseCameraConfig {
  /** Boom distance behind the vehicle. Default 6. */
  distance?: number;
  /** Camera height above the follow point. Default 2.6. */
  height?: number;
  /** Height of the look point above the follow point. Default 1.2. */
  lookHeight?: number;
  /** Spring-arm damping (higher = stiffer, less lag). Default 6. */
  springDamping?: number;
  /** Speed→FOV curve: FOV lerps from `base` to `max` as speed climbs to `speedForMax`. */
  fov?: { base?: number; max?: number; speedForMax?: number };
  /** Procedural shake amplitude per unit of speed (adds to the trauma channel). Default 0.0. */
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
  /** Which view to mount. Default "chase". */
  view?: ChaseView;
  /** Local offset for cockpit/hood/rear seats (relative to the vehicle, +z forward). */
  seatOffsets?: {
    cockpit?: { x?: number; y?: number; z?: number };
    hood?: { x?: number; y?: number; z?: number };
    rear?: { x?: number; y?: number; z?: number };
  };
}

/** Detached spectator/photo cam (#120) — binds to any entity or fixed point, never reads player input. */
export interface ObserverCameraConfig {
  /** What the observer looks at. Omit to stay on a fixed point at the origin (or `point`, if given). */
  bind?: { kind: "entity"; entityId: string } | { kind: "point"; position: { x: number; y: number; z: number } };
  /** Orbit distance from the bound subject. Default 8. */
  distance?: number;
  /** Camera height above the bound subject. Default 3. */
  height?: number;
  /** Height of the look point above the subject. Default 1.2. */
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
  /** World point the camera circles. Default the world origin. */
  target?: { x: number; y: number; z: number };
  /** Orbit radius from the target. Default 8. */
  distance?: number;
  /** Camera height above the target. Default 3. */
  height?: number;
  /** Height of the look point above the target. Default 1.2. */
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
  /** Where scroll-zoom re-anchors the view. Default "target". */
  anchor?: InspectionZoomAnchor;
  /** Orbit target (the point orbited/panned around). Default origin. */
  target?: { x?: number; y?: number; z?: number };
  /** Camera distance from `target` used to seed the initial camera position when `initialPosition` is unset. Default 6. */
  initialDistance?: number;
  /** Explicit starting camera world position; overrides `initialDistance` when set. */
  initialPosition?: { x?: number; y?: number; z?: number };
  minDistance?: number;
  maxDistance?: number;
  /** Vertical orbit clamp (radians). Unset allows a full pole-to-pole orbit, unlike the tighter default on the classic orbit rig. */
  minPolarAngle?: number;
  maxPolarAngle?: number;
  /** Middle-mouse pan. Default true for this rig. */
  pan?: boolean;
  rotateSpeed?: number;
  zoomSpeed?: number;
  dampingFactor?: number;
}

/** One stop on a scripted camera path (#29). */
export interface CameraKeyframe {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  fov?: number;
  /** Seconds to travel from the previous keyframe to this one. Default 1. */
  duration?: number;
  /** Interpolation into this keyframe. Default "smooth" (smoothstep ease). */
  ease?: "linear" | "smooth";
}

/** Scripted keyframe / path player (#29). When set it overrides the active rig. */
export interface CinematicCameraConfig {
  keyframes: readonly CameraKeyframe[];
  /** Restart from the first keyframe after the last. Default false. */
  loop?: boolean;
}

/** Camera-shake / trauma defaults (#28). Any rig reads the trauma channel; game systems feed it via `cameraShake()`. */
export interface CameraShakeConfig {
  /** Positional shake amplitude at full trauma (world units). Default 0.5. */
  maxOffset?: number;
  /** Rotational shake amplitude at full trauma (radians). Default 0.06. */
  maxRoll?: number;
  /** Trauma decay per second (fraction). Default 1.6. */
  decayPerSecond?: number;
  /** Trauma→shake exponent; 2 = quadratic falloff so small hits are subtle. Default 2. */
  exponent?: number;
  /** Noise frequency (Hz) of the shake oscillation. Default 24. */
  frequency?: number;
}

export const CAMERA_FRUSTUM_DEFAULTS = { fov: 55, near: 0.1, far: 300, zoom: 50 } as const;

/** Player-facing FOV preference applied across every perspective camera rig. Orthographic projections ignore it. */
export interface PlayerFovConfig {
  /** Inclusive lower bound for the slider and persisted values. Default 40. */
  min?: number;
  /** Inclusive upper bound for the slider and persisted values. Default 120. */
  max?: number;
  /** Initial FOV when nothing is persisted. Defaults to `frustum.fov` or 55. */
  default?: number;
  /** Persist the preference in localStorage across reloads. Default true. */
  persist?: boolean;
  /** Show the shell FOV slider. Default true for perspective cameras; forced off for orthographic. */
  control?: boolean;
}

/** Camera tuning for the shell's rig stack: pick the rig via `rig`, then tune it through its matching config block. All fields optional — the default is the third-person orbit rig. */
export interface GameCameraConfig {
  /** Selects the rig — the one camera-selection knob. Overrides the legacy `perspective` shorthand. */
  rig?: CameraRigKind;
  /** Canvas camera projection. "orthographic" renders a flat 2D-style view (side-scrollers, falling-block puzzles) — pair with `rig: "sideScroll"`; default perspective. */
  projection?: CameraProjection;
  /** Render frustum overrides applied to the canvas camera. `far` defaults to 300 — raise it for worlds whose content spans more than a few hundred units, or distant scenery silently clips. `zoom` is the orthographic zoom in canvas pixels per world unit, read only when `projection` is "orthographic"; default 50. */
  frustum?: { fov?: number; near?: number; far?: number; zoom?: number };
  /** Universal player FOV preference (slider + persistence) for perspective rigs. Ignored when `projection` is `"orthographic"`. */
  playerFov?: PlayerFovConfig;
  /** @deprecated Legacy shorthand for `rig: "orbit" | "first"` — set `rig` instead. "third" mounts the orbit camera (default); "first" mounts pointer-lock mouse-look. */
  perspective?: "third" | "first";
  /** First-person tuning; only read when the rig resolves to "first". */
  firstPerson?: FirstPersonCameraConfig;
  /** Top-down / isometric tuning (#23); read when `rig: "topDown"`. */
  topDown?: TopDownCameraConfig;
  /** Free-pan / edge-scroll RTS tuning (#24); read when `rig: "rts"`. */
  rts?: RtsCameraConfig;
  /** Over-the-shoulder tuning (#25); read when `rig: "shoulder"`. */
  shoulder?: ShoulderCameraConfig;
  /** Lock-on / strafe tuning (#26); read when `rig: "lockOn"`. */
  lockOn?: LockOnCameraConfig;
  /** Vehicle chase tuning (#27); read when `rig: "chase"`. */
  chase?: ChaseCameraConfig;
  /** Detached spectator/photo cam tuning (#120); read when `rig: "observer"`. */
  observer?: ObserverCameraConfig;
  /** Turntable / showcase tuning; setting this selects the `turntable` rig on its own. */
  turntable?: TurntableCameraConfig;
  /** Fixed side-on follow tuning; read when `rig: "sideScroll"`. */
  sideScroll?: SideScrollCameraConfig;
  /** Model-viewer / inspection tuning (#207.7); read when `rig: "inspection"`. */
  inspection?: InspectionCameraConfig;
  /** Camera-shake / trauma channel defaults (#28); read by every rig. */
  shake?: CameraShakeConfig;
  /** Scripted keyframe path (#29); when set, plays over the active rig. */
  cinematic?: CinematicCameraConfig;
  /** Seconds to cross-fade the camera when the rig changes (#29). 0 hard-cuts. Default 0.6. */
  transitionSeconds?: number;
  minDistance?: number;
  maxDistance?: number;
  targetHeight?: number;
  /** Extra offset on top of entity position for the orbit target. */
  targetOffset?: { x?: number; y?: number; z?: number };
  initialDistance?: number;
  initialHeight?: number;
  /** Initial horizontal boom facing (radians): 0 = camera behind on -Z, PI = camera on +Z. Seeds the orbit rig; unset keeps the legacy -Z placement. */
  initialYaw?: number;
  /** Initial boom elevation (radians): 0 = level, positive = camera above the target looking down. Seeds the orbit rig; unset derives elevation from `initialHeight`/`initialDistance`. */
  initialPitch?: number;
  /** Lock orbit radius while the follow target moves (default true in shell). */
  followLock?: boolean;
  /** When false, orbit target stays fixed (cinematic / debug). Default true. */
  followEnabled?: boolean;
  /** Instance id to follow, or null for an avatar-less free camera; defaults to local player in the dev shell. */
  followEntityId?: string | null;
  /** Fired each frame after cameraFollow lock is applied. */
  onCameraFollow?: (state: CameraFollowState) => void;
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
