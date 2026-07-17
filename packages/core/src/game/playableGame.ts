import type { AudioBusDef, SoundDef } from "../audio/audioFalloff";
import type { MusicTheme } from "../audio/music";
import type { EditorDocument } from "../editor/types";
import type { PostProcessingConfig } from "../render/postProcessing";
import type { LookPreset } from "../render/lookPreset";
import type { TouchControlsConfig } from "../input/touchScheme";
import type { GameSettingsConfig } from "../settings/settingsModel";
import type { GameOrientation } from "../ui/orientation";
import type { HudPlatform, HudViewportConfig } from "../ui/hudScale";
import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { CatalogEntityRole, GameContext, GameContextContent } from "../runtime/gameContext";
import type { ModelDims } from "../scene/assetCatalog";
import type { SkyEnvironmentConfig } from "../world/features";
import type { VisibilityConfig } from "../visibility/config";
import type { GameDefinition, GameLoop } from "./defineGame";
import type { LootFilterRule } from "./lootFilter";
import type { RarityStyle } from "./worldItem";

export interface PointerConfig {
  /**
   * Left-click on open ground runs this command with `{ point, entity, object }`
   * (click-to-move / ground-target). Suppresses the default left-click hotbar fire.
   */
  moveCommand?: string;
  /** Enable left-drag marquee + single-click box-select of entities (RTS unit command). */
  select?: boolean;
  /** Only entities matching this pass are selectable/orderable; default all non-local entities. */
  selectFilter?: (entityId: string) => boolean;
  /** Right-click on ground runs this command with `{ selection, point }` — order the selection. */
  orderCommand?: string;
  /** Right-click on an entity/object opens the target's catalog verb menu (#31). */
  contextMenu?: boolean;
  /** Route the primary ability's aim to the cursor world point instead of camera yaw/pitch (#22). */
  aim?: boolean;
  /** Left-click a `worldItem` within pickup radius grants it to the local player and despawns it (#32). */
  grabWorldItems?: boolean;
  /** Press the bound `ping` action → `worldHit()` → run this command with `{ point, entity, object, normal }` (contextual ping, #94). */
  pingCommand?: string;
  /** Right-click runs this command with `{ point, entity, object, aim }` when neither `orderCommand` nor `contextMenu` claims the click (#164.4). */
  secondaryCommand?: string;
}

export interface CameraFollowState {
  entityId: string;
  target: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  distance: number;
}

/** Props handed to a `WorldOverlay` component (#542): explicit `ctx` access so canvas-layer VFX read live engine state directly, without an extra hook or a module-global workaround. */
export interface WorldOverlayProps {
  ctx: GameContext;
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

export interface GameCameraConfig {
  /** Selects the rig. Overrides `perspective`; leave unset to fall back to `perspective`. */
  rig?: CameraRigKind;
  /** Canvas camera projection. "orthographic" renders a flat 2D-style view (side-scrollers, falling-block puzzles) — pair with `rig: "sideScroll"`; default perspective. */
  projection?: CameraProjection;
  /** Render frustum overrides applied to the canvas camera. `far` defaults to 300 — raise it for worlds whose content spans more than a few hundred units, or distant scenery silently clips. `zoom` is the orthographic zoom in canvas pixels per world unit, read only when `projection` is "orthographic"; default 50. */
  frustum?: { fov?: number; near?: number; far?: number; zoom?: number };
  /** Universal player FOV preference (slider + persistence) for perspective rigs. Ignored when `projection` is `"orthographic"`. */
  playerFov?: PlayerFovConfig;
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

export interface EntitySpriteConfig {
  url: string;
  width: number;
  height: number;
  y: number;
}

export interface WorldItemRenderConfig {
  /** Baseline rarity→color/beam/label render binding (#32); the game's rarity palette. */
  rarityStyle?: Record<string, RarityStyle>;
  /** Loot-filter rules layered over the rarity baseline (#33) — data the game supplies, first match wins. */
  filter?: readonly LootFilterRule[];
  /** World units within which a ground item is grabbable/highlighted. Default 2. */
  pickupRadius?: number;
  /** Beam height above the item's ground position. Default 2.5. */
  beamHeight?: number;
  /** Walk-over collection: the shell grants the nearest dropped item within this radius of the local player each frame (Minecraft-style pickup). `true` uses `pickupRadius`. Omitted/false leaves pickup to `pointer.grabWorldItems` clicks. */
  autoPickup?: boolean | { radius?: number };
}

/**
 * Player-vs-world collision for the first-person controller. Without this the
 * shell keeps the player on flat ground at y=0. With `voxel: true` the shell
 * resolves the player as a box against placed scene objects (each treated as a
 * solid unit cell), so they stand on blocks, fall into holes, and are stopped by
 * walls — the controller a block-building/mining game needs.
 */
export interface VoxelCollisionConfig {
  voxel: true;
  /** Half the player box width on each horizontal axis. Default 0.3. */
  halfWidth?: number;
  /** Player box height from the feet. Default 1.8. */
  height?: number;
  /** Tallest ledge walked up without jumping. Default 0.6. */
  stepHeight?: number;
}

/** Movement-state clip set for `ModelAnimationConfig.states`: the shell reads the entity's live speed each frame and crossfades between these clips, so a walking mob animates without any game-side driver. */
export interface ModelAnimationStates {
  /** Clip name while the entity is stationary. */
  idle: string;
  /** Clip name while the entity is moving. */
  walk: string;
  /** Clip name above `runSpeed`; omit to keep `walk` at any speed. */
  run?: string;
  /** Speed (world units/sec) above which the entity counts as moving. Default 0.5. */
  walkSpeed?: number;
  /** Speed above which `run` plays when provided. Default 6. */
  runSpeed?: number;
  /** Crossfade duration in seconds when the state changes. Default 0.2. */
  fadeSec?: number;
}

/** Rig playback for a `ModelConfig`'s GLTF animation clips — looping idles, one-shots, and held poses. */
export interface ModelAnimationConfig {
  /** Clip name to play; defaults to the GLB's first clip. */
  clip?: string;
  /** Loop the clip. Default true. */
  loop?: boolean;
  /** Playback rate multiplier. Default 1. */
  timeScale?: number;
  /** Hold the rig on a fixed frame instead of advancing it each tick. */
  paused?: boolean;
  /** Seek the clip to this time in seconds; combine with `paused: true` to hold a specific pose ("pose library" usage). */
  time?: number;
  /** Speed-driven idle/walk/run clip switching, crossfaded by the shell from the entity's live movement; overrides `clip` while set. */
  states?: ModelAnimationStates;
  /**
   * One-shot clips keyed by event name, each played once over the locomotion state then released back to it.
   * Reserved keys `hit` and `death` auto-fire on this entity's `combat.hitReaction` / `entity.died`; any other
   * key fires when the game emits `entity.animation` (`ctx.game.playEntityAnimation(instanceId, event)`). A
   * `string[]` picks a random variant per trigger. `death` clamps on its final frame instead of returning.
   */
  oneShots?: Record<string, string | readonly string[]>;
}

/**
 * Real PBR map URLs (e.g. `buildMaterialCatalog(...).resolve(id)!.maps` from `@jgengine/assets`)
 * layered onto a model's material — the seam for texturing an otherwise-flat/untextured GLB. Any
 * role may be omitted to keep the model's own map.
 */
export interface ModelMaterialMaps {
  color?: string;
  normal?: string;
  roughness?: string;
  ao?: string;
}

/** Per-entity PBR material override (#151.3) applied to every `MeshStandardMaterial` in the model's cloned scene graph. */
export interface ModelMaterialOverride {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Real PBR texture maps applied over the model's material — see {@link ModelMaterialMaps}. */
  maps?: ModelMaterialMaps;
}

/** Parents a prop/weapon model to a named bone or node on the host model's rig — a sword on `handslot.r`, a spellbook offhand — following the bone's animated transform each frame. */
export interface ModelAttachment {
  /** Bone or node name in the rig to parent to (e.g. `"handslot.r"`). */
  slot: string;
  /** The attached model — a catalog asset id or an inline `ModelConfig`. */
  model: string | ModelConfig;
  /** Local position offset at the bone, in the attached model's own space. */
  position?: [number, number, number];
  /** Local Euler rotation (radians) applied at the bone. */
  rotation?: [number, number, number];
  /** Uniform scale of the attached model at the bone. Default 1. */
  scale?: number;
}

/** Static child model stacked at a fixed local offset under its parent's transform — no bone/rig resolution, unlike `ModelAttachment`. Assembles a compound entity (e.g. a modular castle wall + tower + roof) from several single-mesh kit pieces. */
export interface ModelPart {
  /** The child model — a catalog asset id or an inline `ModelConfig`; resolves through the catalog exactly like the top-level model and gets its own `dims`/anchor centering. */
  model: string | ModelConfig;
  /** Local position offset under the parent's transform. */
  position?: [number, number, number];
  /** Local Euler rotation (radians) under the parent's transform. */
  rotation?: [number, number, number];
  /** Uniform scale of the part under the parent's transform. Default 1. */
  scale?: number;
}

export interface ModelConfig {
  url: string;
  scale?: number;
  /** Normalize the rendered model to this world-unit height: the shell measures the loaded scene's bounding box, scales it so its height matches, and grounds its lowest point at the placement Y. Composes with `scale` as a multiplier. */
  targetHeight?: number;
  y?: number;
  /** How the model registers on its placement point. `"center"` (default) horizontally centers the measured footprint on the point and ground-snaps its lowest vertex to the point's Y — the correct behavior for corner-pivot modular kits. `"origin"` renders at the raw GLB origin (legacy). */
  anchor?: "center" | "origin";
  /** Measured footprint/center/minY; supplied automatically when the model resolves through an `@jgengine/assets` catalog. Required for `anchor: "center"` to take effect. */
  dims?: ModelDims;
  /** Per-entity PBR tint/finish override (#151.3); cloned onto each `MeshStandardMaterial` in the model so shared GLTF caches stay untouched. */
  material?: ModelMaterialOverride;
  /** Plays a GLTF animation clip on the model when the source has any (skinned or not); omit to render the rig's bind pose. */
  animation?: ModelAnimationConfig;
  /** Props/weapons parented to named bones on this model's rig; each follows its bone through animation. */
  attachments?: readonly ModelAttachment[];
  /** Static kit-of-parts pieces stacked at fixed local offsets — no bone/rig involved. Use this for a compound entity assembled from several modular meshes (a castle keep from base + mid + roof pieces); use `attachments` for props parented to an animated rig's bones. */
  parts?: readonly ModelPart[];
}

export interface ObjectStyle {
  color?: string;
  opacity?: number;
  hidden?: boolean;
}

export interface AmbientLightingConfig {
  color?: string;
  intensity?: number;
}

export interface DirectionalLightingConfig {
  color?: string;
  intensity?: number;
  position: readonly [number, number, number];
  castShadow?: boolean;
  /** Shadow map resolution in px (square) when `castShadow`. Higher = crisper, costlier. Default 1024. */
  shadowMapSize?: number;
  /** Half-extent of the orthographic shadow camera in world units — sized to the shadowed area. Default 40. */
  shadowCameraSize?: number;
  /** Shadow depth bias to fight acne. Default -0.0004. */
  shadowBias?: number;
  /** Shadow normal bias to fight peter-panning. Default 0.02. */
  shadowNormalBias?: number;
}

export interface HemisphereLightingConfig {
  skyColor?: string;
  groundColor?: string;
  intensity?: number;
}

/** Declarative lighting replacing the shell's hardcoded ambient/directional default (#207.5); mounts regardless of world kind, only when supplied. */
export interface LightingConfig {
  ambient?: AmbientLightingConfig;
  directional?: readonly DirectionalLightingConfig[];
  hemisphere?: HemisphereLightingConfig;
}

export interface BackdropFogConfig {
  color?: string;
  near?: number;
  far?: number;
  /** Exponential (`FogExp2`) falloff instead of linear near/far; when set, `near`/`far` are ignored. */
  density?: number;
}

/** Generic sky/background/fog for ANY world kind, including a custom `environment` component (#207.6). */
export interface BackdropConfig {
  background?: string;
  sky?: SkyEnvironmentConfig;
  fog?: BackdropFogConfig;
}

/** Movement-control levers for the shell-driven local player walk controller. */
export interface PlayerMovementConfig {
  /** "free" (default) moves camera-relative across the plane; "axis" locks travel to one world axis; "grid" snaps each committed position to cell centers. */
  mode?: "free" | "axis" | "grid";
  /** World axis for mode "axis". Default "x". */
  axis?: "x" | "z";
  /** Cell size for mode "grid". Default 1. */
  cellSize?: number;
  /** Collide the walking player against placed scene objects (unit-box AABBs) even without `collision.voxel`. Default false. */
  collideObjects?: boolean;
  /** Intercepts each frame's resolved position before the pose commits (and before onTick): return a replacement [x,y,z] to constrain or redirect the step, or nothing to accept it. */
  beforeCommit?: (frame: MovementCommitFrame) => readonly [number, number, number] | undefined | void;
  /** Gates the built-in sprint (`runSpeedMultiplier`) behind live game state — a stamina stat, an encumbrance check (#282.3). Called each frame while sprint is held; `false` walks. */
  canSprint?: (ctx: GameContext) => boolean;
  /** Fraction of walk speed while backpedalling (holding `moveBack`). Overrides the engine default (0.65). */
  backpedalMult?: number;
  /** Radians/second the rendered body rotates toward its movement heading (shortest arc), so strafing/backpedalling read as a turn rather than an instant flip; also the rate the internally-integrated `turnLeft`/`turnRight` heading turns when the shell doesn't own yaw. Unset = body facing snaps instantly (no change to existing feel). */
  turnSpeed?: number;
  /** On-foot swimming when the terrain declares a `waterLevel` and the player is submerged: caps speed and floats them at the surface. `true` uses defaults; default off. */
  swim?: { speedMultiplier?: number } | boolean;
  /** Slide the player downhill on terrain steeper than they can stand on (heightfield worlds only). `true` uses defaults; default off. */
  slopeSlide?: { maxClimbSlope?: number } | boolean;
}

/** One frame's movement resolution handed to `PlayerMovementConfig.beforeCommit`. */
export interface MovementCommitFrame {
  entityId: string;
  current: readonly [number, number, number];
  next: readonly [number, number, number];
  dt: number;
  /** The live game context (#282.2) — movement rules read stores/stats directly instead of module-level bridge objects. */
  ctx: GameContext;
}

/** How a screenshot host reaches live gameplay in this game — the data behind `shoot --mode play`. */
export interface GameCaptureConfig {
  /** Commands run (in order, via `ctx.game.commands.run`) right after boot when a capture host requests the play screen — the same commands the start-menu buttons dispatch. A bare string runs with a default input; the object form carries the input a command needs (e.g. `[{ name: "class.select", input: { classId: "siren" } }, "startRun"]`). A name the game never registers fails the capture loudly instead of shipping a menu screenshot. */
  play?: readonly (string | { name: string; input?: unknown })[];
  /** Named capture states beyond live gameplay — any screen worth screenshotting on demand (`lobby`, `store`, `game_over`), each mapping to the command sequence that reaches it from boot. `shoot <game> --state <name>` runs that sequence and captures whatever is on screen — menus included, no live-play guard. An unknown state name fails the capture with the declared list. */
  states?: Record<string, readonly (string | { name: string; input?: unknown })[]>;
  /** Extra milliseconds the capture host waits after `play` commands before taking the play-mode screenshot — cover an intro cinematic or spawn-in fade. Default 2500. */
  settleMs?: number;
  /** Bot-playtest read hook: maps live game state to a flat vector of numeric progress metrics the `drive --playtest` harness samples over time (e.g. `{ x, z, score, phase }`). Genre-agnostic — "progress" is whatever the game reports; the engine stays neutral. The harness watches these numbers move under scripted input: any metric changing beyond an epsilon counts as forward progress, all metrics flat past the softlock threshold under active input flags a softlock. Return every value that should count as advancing; omit to opt the game out of the playtest rung. */
  probe?: (ctx: GameContext) => Record<string, number>;
}

export interface PlayableGame<
  TUi = unknown,
  TWorldOverlay = unknown,
  TRenderEntity = never,
  TRenderObject = never,
  TViewmodel = unknown,
  TOverlay = TWorldOverlay,
> {
  game: GameDefinition;
  content: GameContextContent;
  loop: Required<Omit<GameLoop<GameContext>, "onPlayerLeave">> & Pick<GameLoop<GameContext>, "onPlayerLeave">;
  GameUI: TUi;
  /** Which shell mount to use. Default `"3d"` (canvas, camera rig, pointer, world rendering). `"hud"` mounts no 3D canvas, camera rig, or pointer — the game is `GameUI` plus the command/input loop, for board/card/menu games. */
  presentation?: "3d" | "hud";
  /** Optional canvas-layer VFX component (e.g. traveling projectiles); receives `{ ctx }` (#542) so overlay VFX read live engine state without a separate hook or a module-global workaround. */
  WorldOverlay?: TOverlay;
  /** Replaces the default demo backdrop (ground + grid + rocks) with the game's own scene — ground, sky, structures. Camera, input, HUD, entity rendering, and the loop stay shell-provided; supply your world without forking the shell. When unset and `game.world` is an `environment()` descriptor, the shell auto-renders that world here — no manual wiring needed. */
  environment?: TWorldOverlay;
  /** The game's authored scene document (`editor.scene.json`, normalized). When set and no `WorldOverlay` is supplied, the shell auto-mounts `AuthoredScene` over it (draped paths, scatter, studios, placed catalog props), and the embedded editor opens it as its default layers — the zero-wiring path from document to play and edit modes. */
  editorLayers?: EditorDocument;
  /** Custom first-person viewmodel (#542), read when the active rig is first-person. Rendered inside the shell's camera-locked, muzzle-tracked anchor in place of the built-in three-mesh gun; receives a live `cuesRef` (velocity/bob/firing/reloading/recoil) driven from the followed entity — see `@jgengine/shell/camera`'s `ViewmodelProps`. Set `camera.firstPerson.viewmodel: false` to render no viewmodel at all regardless of this field. */
  viewmodel?: TViewmodel;
  /** Per-entity visual override: return your own mesh for an entity and the shell still positions it and drives selection/targeting. Return null/undefined to fall back to model → sprite → primitive. */
  renderEntity?: TRenderEntity;
  /** Per-object visual override: return your own mesh for a placed scene object and the shell still positions it and drives picking. Return null/undefined to fall back to objectModels → styled box. */
  renderObject?: TRenderObject;
  /** Billboard sprites keyed by entity kind name; unmatched entities get primitive markers. */
  entitySprites?: Record<string, EntitySpriteConfig>;
  /** GLB models keyed by entity kind name; a string resolves as an asset-catalog key via game.assets, a ModelConfig renders directly. Takes priority over sprites, then primitives. */
  entityModels?: Record<string, string | ModelConfig>;
  /** GLB models keyed by object catalog id; a string resolves via game.assets, a ModelConfig renders directly. Replaces the colored box when present. */
  objectModels?: Record<string, string | ModelConfig>;
  /** Styling for the default colored-box object render, keyed by catalog id: color override, opacity (< 1 sets transparent), hidden (skips the mesh but keeps the positioning group + picking). */
  objectStyles?: Record<string, ObjectStyle>;
  /** Optional scroll-selected hotbar index for primary ability (mouse0). */
  hotbarSelection?: () => number;
  /** Positioned proximity prompts for the interact key + HUD; single source shared with useActivePrompt. */
  prompts?: (ctx: GameContext) => readonly PositionedPrompt[];
  /** Camera tuning (perspective, orbit, first-person) for the dev game player shell. */
  camera?: GameCameraConfig;
  /** Screenshot-host recipe for reaching live gameplay past a start menu (`shoot --mode play` runs `capture.play` automatically). Any game with a start/title screen declares this. */
  capture?: GameCaptureConfig;
  /** Cast/receive shadows across the scene (R3F Canvas shadow pass). Default true. */
  shadows?: boolean;
  /** Pointer-driven input: click-to-move, box-select, right-click verbs, cursor aim (#22/#30/#31). */
  pointer?: PointerConfig;
  /** Touch controls on coarse-pointer devices. Unset derives a scheme from `input` (virtual joystick for movement actions, on-screen buttons for the rest); a config refines it with gestures and curated buttons; `false` opts out. */
  touch?: TouchControlsConfig | false;
  /** Phone orientation contract. Legacy `"landscape"`/`"portrait"` stays advisory (a dismissible rotate hint). The object form `{ mobile: "landscape-required" }` is strict — the shell shows an engine-owned rotate screen and blocks gameplay until the device is turned. See `GameOrientation`. */
  orientation?: GameOrientation;
  /** Where the game is meant to be played. Default `["web", "mobile"]` — design-resolution HUD fit is on for every game: `HudCanvas` auto-scales from `hudFit.designSize` down to the live viewport, so the desktop layout shrinks to fit a phone instead of overflowing it. Declare `["web"]` to opt a desktop-only game out (compact displays fall back to the legacy fixed 0.85 zoom). */
  platforms?: readonly HudPlatform[];
  /** HUD design resolution + scale clamps (default 1600×900, scale 0.4–1). `mobile` overrides tune the phone fit separately — the same resolution system drives desktop UI-scale and phone shrink. */
  hudFit?: HudViewportConfig;
  /** Opt in to world-space health bars floating over non-local entities that carry the stat. `roles` restricts bars to entities whose catalog entry declares one of the given roles; `maxDistance` hides bars beyond this many world units from the player (default 60). */
  worldHealthBars?: boolean | { statId?: string; roles?: readonly CatalogEntityRole[]; maxDistance?: number };
  /**
   * Opt in to billboarded nameplates (name + optional HP bar) floating over non-local entities — the
   * MMO "who's this and how hurt are they" readout. `roles` restricts to entities whose catalog entry
   * declares one of the given roles (default: all); `maxDistance` hides nameplates beyond this many
   * world units from the player (default 40). Headless: skin every part via `className`/`data-*` hooks
   * on `WorldNameplates` (`@jgengine/shell/world/WorldHud`) — this flag only turns the readout on and
   * scopes which entities it covers.
   */
  nameplates?: boolean | { statId?: string; roles?: readonly CatalogEntityRole[]; maxDistance?: number };
  /** Sound catalog + mix buses (music/sfx/ambient/…) the shell's Web Audio glue plays from. Catalog-first — no per-game audio wiring. `sounds` may be sample (`url`) or procedural (`synth`); `music` holds procedural themes crossfaded via `ctx.game.audio.music(id)`. */
  audio?: {
    sounds: Record<string, SoundDef>;
    buses?: Record<string, AudioBusDef>;
    music?: Record<string, MusicTheme>;
    musicBus?: string;
  };
  /** Continuous positional emitter keyed by entity kind name: while a matching entity exists, the shell plays and repositions the mapped `audio.sounds` id (looping engine hum, campfire crackle, footstep loop) with listener-distance falloff. */
  entitySounds?: Record<string, string>;
  /** Same as `entitySounds` but keyed by placed-object catalog id (torches, machinery). */
  objectSounds?: Record<string, string>;
  /** Rarity render binding + loot filter for dropped-item ground presentation (#32/#33). */
  worldItem?: WorldItemRenderConfig;
  /** Player-vs-world collision for the first-person controller (block/voxel worlds). Off by default (flat ground). */
  collision?: VoxelCollisionConfig;
  /** Movement-control levers (axis/grid constraints, object collision, pre-commit hook) for the shell-driven walk controller. */
  movement?: PlayerMovementConfig;
  /** Default-look preset (#773). Unset/`"cinematic"` composes a real sky, a shadow-casting sun+hemisphere rig, a network-free image-based-lighting environment (soft PBR reflections), and a tuned tone-map/bloom/AO/vignette post stack, so a scene reads lit-like-a-game out of the box; `"flat"` opts out to the bare ambient+directional default. Upgraded default primitive materials (tuned PBR + subtle procedural surface detail) apply under both presets. Any explicit `lighting`/`backdrop`/`postProcessing` always wins. */
  look?: LookPreset;
  /** Declarative ambient/directional/hemisphere lighting (#207.5); replaces the shell's hardcoded default lights when present, regardless of world kind. */
  lighting?: LightingConfig;
  /** Generic background/sky/fog (#207.6), applied for any world kind including a custom `environment` component. */
  backdrop?: BackdropConfig;
  /** Declarative post-processing chain (AO/bloom/tone-map/grade). When set, the shell mounts an EffectComposer and owns the render; absent leaves the renderer drawing directly (unchanged). */
  postProcessing?: PostProcessingConfig;
  /** F2+D debug overlay (frame/sim timing, logs, backend latency, keybinds, live tunables). On for every game by default; `false` disables the toggle. */
  devtools?: boolean;
  /** Player settings menu. Auto-mounted for every game (Sound / Graphics / Gameplay / Controls); unset uses the defaults, `false` opts out. Add game-specific rows via `extra`, switch overlay/full-page via `mode`, or swap the gear for compact on-screen buttons via `surface: "quick"`. */
  settings?: GameSettingsConfig | false;
  /** Automatic camera frustum + distance culling and asset streaming. On by default with conservative margins; unset uses engine defaults, `{ enabled: false }` opts out. Override bounds/distance/pins per entity kind or object catalog id. */
  visibility?: VisibilityConfig;
}

export function worldHealthBarAllowsRole(
  roles: readonly CatalogEntityRole[] | undefined,
  role: CatalogEntityRole | undefined,
): boolean {
  if (roles === undefined) return true;
  return role !== undefined && roles.includes(role);
}
