import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { GameContext, GameContextContent } from "../runtime/gameContext";
import type { ModelDims } from "../scene/assetCatalog";
import type { GameDefinition, GameLoop } from "./defineGame";

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
  /** Render a simple first-person weapon in view. Default true. */
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
 */
export type CameraRigKind = "orbit" | "first" | "topDown" | "rts" | "shoulder" | "lockOn" | "chase";

/** Fixed top-down / isometric rig (#23) — height/pitch/yaw + decoupled follow. */
export interface TopDownCameraConfig {
  /** Camera height above the follow point. Default 18. */
  height?: number;
  /** Look-down angle in radians (0 = straight down, PI/2 = level). Default ~1.02 (~58°, ARPG iso). */
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
  /** Which view to mount. Default "chase". */
  view?: ChaseView;
  /** Local offset for cockpit/hood/rear seats (relative to the vehicle, +z forward). */
  seatOffsets?: {
    cockpit?: { x?: number; y?: number; z?: number };
    hood?: { x?: number; y?: number; z?: number };
    rear?: { x?: number; y?: number; z?: number };
  };
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

export interface GameCameraConfig {
  /** Selects the rig. Overrides `perspective`; leave unset to fall back to `perspective`. */
  rig?: CameraRigKind;
  /** "third" mounts the orbit camera (default); "first" mounts pointer-lock mouse-look. Shorthand for `rig: "orbit" | "first"`. */
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
}

export interface EntitySpriteConfig {
  url: string;
  width: number;
  height: number;
  y: number;
}

export interface ModelConfig {
  url: string;
  scale?: number;
  y?: number;
  /** How the model registers on its placement point. `"center"` (default) horizontally centers the measured footprint on the point and ground-snaps its lowest vertex to the point's Y — the correct behavior for corner-pivot modular kits. `"origin"` renders at the raw GLB origin (legacy). */
  anchor?: "center" | "origin";
  /** Measured footprint/center/minY; supplied automatically when the model resolves through an `@jgengine/assets` catalog. Required for `anchor: "center"` to take effect. */
  dims?: ModelDims;
}

export interface PlayableGame<TUi = unknown, TWorldOverlay = unknown, TRenderEntity = never> {
  game: GameDefinition;
  content: GameContextContent;
  loop: Required<GameLoop<GameContext>>;
  GameUI: TUi;
  /** Optional canvas-layer VFX component (e.g. traveling projectiles). */
  WorldOverlay?: TWorldOverlay;
  /** Replaces the default demo backdrop (ground + grid + rocks) with the game's own scene — ground, sky, structures. Camera, input, HUD, entity rendering, and the loop stay shell-provided; supply your world without forking the shell. */
  environment?: TWorldOverlay;
  /** Per-entity visual override: return your own mesh for an entity and the shell still positions it and drives selection/targeting. Return null/undefined to fall back to model → sprite → primitive. */
  renderEntity?: TRenderEntity;
  /** Billboard sprites keyed by entity kind name; unmatched entities get primitive markers. */
  entitySprites?: Record<string, EntitySpriteConfig>;
  /** GLB models keyed by entity kind name; a string resolves as an asset-catalog key via game.assets, a ModelConfig renders directly. Takes priority over sprites, then primitives. */
  entityModels?: Record<string, string | ModelConfig>;
  /** GLB models keyed by object catalog id; a string resolves via game.assets, a ModelConfig renders directly. Replaces the colored box when present. */
  objectModels?: Record<string, string | ModelConfig>;
  /** Optional scroll-selected hotbar index for primary ability (mouse0). */
  hotbarSelection?: () => number;
  /** Positioned proximity prompts for the interact key + HUD; single source shared with useActivePrompt. */
  prompts?: (ctx: GameContext) => readonly PositionedPrompt[];
  /** Camera tuning (perspective, orbit, first-person) for the dev game player shell. */
  camera?: GameCameraConfig;
  /** Opt in to world-space health bars floating over non-local entities that carry the stat. */
  worldHealthBars?: boolean | { statId?: string };
}
