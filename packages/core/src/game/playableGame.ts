import type { AudioBusDef, SoundDef } from "../audio/audioFalloff";
import type { TouchControlsConfig } from "../input/touchScheme";
import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { CatalogEntityRole, GameContext, GameContextContent } from "../runtime/gameContext";
import type { ModelDims } from "../scene/assetCatalog";
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
 * - `observer` — detached spectator/photo cam bound to any entity or fixed point; never reads player input.
 * - `sideScroll` — fixed lateral follow (2.5D platformer/beat-'em-up side view); reads no player input.
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
  | "sideScroll"
  | "none";

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
  /** Render frustum overrides applied to the canvas camera. `far` defaults to 300 — raise it for worlds whose content spans more than a few hundred units, or distant scenery silently clips. */
  frustum?: { fov?: number; near?: number; far?: number };
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
  /** Fixed side-on follow tuning; read when `rig: "sideScroll"`. */
  sideScroll?: SideScrollCameraConfig;
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
}

/** Per-entity PBR material override (#151.3) applied to every `MeshStandardMaterial` in the model's cloned scene graph. */
export interface ModelMaterialOverride {
  color?: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface ModelConfig {
  url: string;
  scale?: number;
  y?: number;
  /** How the model registers on its placement point. `"center"` (default) horizontally centers the measured footprint on the point and ground-snaps its lowest vertex to the point's Y — the correct behavior for corner-pivot modular kits. `"origin"` renders at the raw GLB origin (legacy). */
  anchor?: "center" | "origin";
  /** Measured footprint/center/minY; supplied automatically when the model resolves through an `@jgengine/assets` catalog. Required for `anchor: "center"` to take effect. */
  dims?: ModelDims;
  /** Per-entity PBR tint/finish override (#151.3); cloned onto each `MeshStandardMaterial` in the model so shared GLTF caches stay untouched. */
  material?: ModelMaterialOverride;
  /** Plays a GLTF animation clip on the model when the source has any (skinned or not); omit to render the rig's bind pose. */
  animation?: ModelAnimationConfig;
}

export interface ObjectStyle {
  color?: string;
  opacity?: number;
  hidden?: boolean;
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
}

/** One frame's movement resolution handed to `PlayerMovementConfig.beforeCommit`. */
export interface MovementCommitFrame {
  entityId: string;
  current: readonly [number, number, number];
  next: readonly [number, number, number];
  dt: number;
}

export interface PlayableGame<TUi = unknown, TWorldOverlay = unknown, TRenderEntity = never, TRenderObject = never> {
  game: GameDefinition;
  content: GameContextContent;
  loop: Required<GameLoop<GameContext>>;
  GameUI: TUi;
  /** Which shell mount to use. Default `"3d"` (canvas, camera rig, pointer, world rendering). `"hud"` mounts no 3D canvas, camera rig, or pointer — the game is `GameUI` plus the command/input loop, for board/card/menu games. */
  presentation?: "3d" | "hud";
  /** Optional canvas-layer VFX component (e.g. traveling projectiles). */
  WorldOverlay?: TWorldOverlay;
  /** Replaces the default demo backdrop (ground + grid + rocks) with the game's own scene — ground, sky, structures. Camera, input, HUD, entity rendering, and the loop stay shell-provided; supply your world without forking the shell. When unset and `game.world` is an `environment()` descriptor, the shell auto-renders that world here — no manual wiring needed. */
  environment?: TWorldOverlay;
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
  /** Cast/receive shadows across the scene (R3F Canvas shadow pass). Default true. */
  shadows?: boolean;
  /** Pointer-driven input: click-to-move, box-select, right-click verbs, cursor aim (#22/#30/#31). */
  pointer?: PointerConfig;
  /** Touch controls on coarse-pointer devices. Unset derives a scheme from `input` (virtual joystick for movement actions, on-screen buttons for the rest); a config refines it with gestures and curated buttons; `false` opts out. */
  touch?: TouchControlsConfig | false;
  /** Opt in to world-space health bars floating over non-local entities that carry the stat. `roles` restricts bars to entities whose catalog entry declares one of the given roles. */
  worldHealthBars?: boolean | { statId?: string; roles?: readonly CatalogEntityRole[] };
  /** Sound catalog + mix buses (music/sfx/ambient/…) the shell's Web Audio glue plays from. Catalog-first — no per-game audio wiring. */
  audio?: { sounds: Record<string, SoundDef>; buses?: Record<string, AudioBusDef> };
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
}

export function worldHealthBarAllowsRole(
  roles: readonly CatalogEntityRole[] | undefined,
  role: CatalogEntityRole | undefined,
): boolean {
  if (roles === undefined) return true;
  return role !== undefined && roles.includes(role);
}
