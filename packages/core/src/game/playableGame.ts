import type { ControlGroupOptions } from "../input/controlGroups";
import type { AnimGraph } from "../anim/animGraph";
import type { WornLayer } from "../anim/wearable/wornRegion";
import type { CharacterMotionConfig } from "../anim/characterMotion";
import type { AmbienceZoneDef } from "../audio/ambience";
import type { AudioBusDef, SoundDef } from "../audio/audioFalloff";
import type { AudioOcclusionConfig } from "../audio/occlusion";
import type { AdaptiveMusicConfig } from "../audio/adaptiveMusic";
import type { AudioReverbConfig } from "../audio/reverb";
import type { MusicTheme } from "../audio/music";
import type { ModelShadowMode, ModelVariantLodConfig } from "../lod/modelLod";
import type { MeshLodConfig } from "../lod/builtLods";
import type { SwimDiveConfig } from "../movement/playerMovement";
export type { ModelShadowMode, ModelVariantConfig, ModelVariantLodConfig } from "../lod/modelLod";
import type { UiCueOverrides } from "../ui/uiCues";
import type { FeedbackCueOverrides } from "../audio/feedbackCues";
import type { NoticeFeedConfig } from "../notifications/notices";

import type { MaterialAsset, MaterialAssignment, MaterialSurfaceParameters, MaterialTextureRole } from "../material/materialAsset";
import type { EditorCatalogDefinition, EditorDocument } from "../editor/types";
import type { PostProcessingConfig } from "../render/postProcessing";
import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";
import type { SpriteAtlas } from "../assets/spriteAtlas";
import type { LookPreset } from "../render/lookPreset";
import type { LookMood } from "../render/lookMood";
import type { AmbientLifeConfig } from "../render/ambientLife";
import type { GamepadFeelConfig } from "../input/gamepadModel";
import type { LocalPlayersConfig } from "../runtime/localPlayers";
import type { PresencePoseRow } from "../runtime/transport";
import type { TouchControlsConfig } from "../input/touchScheme";
import type { GameSettingsConfig } from "../settings/settingsModel";
import type { GraphicsProfile } from "../settings/graphicsProfile";
import type { GameOrientation } from "../ui/orientation";
import type { HudPlatform, HudViewportConfig } from "../hud/hudScale";
import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { ChaseCameraTuning } from "../runtime/cameraDirector";
import type { CatalogEntityRole, GameContext, GameContextContent } from "../runtime/gameContext";
import type { FreeFlightBindings } from "../flight/freeFlight";
import type { SceneEntity } from "../scene/entityStore";
import type { ModelDims } from "../scene/assetCatalog";
import type { PartMotionParams, PartRole } from "./partAnimation";
import type { CollisionMeshData } from "../scene/collisionMesh";
import type { SkyEnvironmentConfig, TerrainDetailMaterialConfig } from "../world/features";
import type { VisibilityConfig } from "../visibility/config";
import type { GameDefinition, GameLoop } from "./defineGame";
import type { GameCameraConfig } from "../camera/cameraConfig";
import type { ViewportsConfig } from "./viewports";
import type { I18n } from "../i18n/i18n";
import type { LootFilterRule } from "../loot/lootFilter";
import type { RarityStyle } from "../loot/groundItem";
import type { ImpactClass } from "../combat/impactProfile";
import type { ImpactDecalsConfig } from "../vfx/impactDecals";

export interface NoticePresentationConfig extends NoticeFeedConfig {
  placement?: "top" | "center" | "bottom";
  /** Distance from the band's screen edge (px or a CSS length), added to the device safe-area inset. Default `clamp(64px, 14%, 150px)` for top, `clamp(120px, 22%, 230px)` for bottom, 34% for center. */
  offset?: number | string;
  avoidHud?: boolean;
  zIndex?: number;
  hidden?: boolean;
  refusals?: boolean;
  cues?: boolean;
}

export type {
  CameraFollowState,
  CameraKeyframe,
  CameraProjection,
  CameraRigKind,
  CameraWeaponView,
  CameraRigShakeConfig,
  ChaseCameraConfig,
  ChaseView,
  CinematicCameraConfig,
  FirstPersonCameraConfig,
  FirstPersonCollisionConfig,
  GameCameraConfig,
  InspectionCameraConfig,
  InspectionZoomAnchor,
  LockOnCameraConfig,
  ObserverCameraConfig,
  PlayerFovConfig,
  RtsCameraConfig,
  ShoulderCameraConfig,
  SideScrollCameraConfig,
  TopDownCameraConfig,
  TurntableCameraConfig,
} from "../camera/cameraConfig";
export { CAMERA_FRUSTUM_DEFAULTS } from "../camera/cameraConfig";

/** @capability pointer-commands click an entity or the ground to run a command (click-to-target, click-to-move, grab loot, marquee select, Shift/double-click select modifiers, RTS control groups) */
export interface PointerConfig {
  /**
   * Left-click runs this command with `{ point, entity, object }`; `entity` is the clicked entity id or
   * null, so the same command covers click-to-move, ground-target and click-to-target
   * (`ctx.scene.entity.setTarget`). Suppresses the default left-click hotbar fire.
   */
  moveCommand?: string;
  select?: boolean;
  selectFilter?: (entityId: string) => boolean;
  selectKind?: (entityId: string) => string | null;
  /**
   * RTS control groups over `ctx.scene.entity.controlGroups` (keys `"0"`…`"9"`, or `keyPrefix` + digit):
   * Ctrl/Cmd+digit binds the selection, Shift+digit appends it, a digit recalls (dropping ids that no
   * longer exist or fail `selectFilter`), and a second tap within `doubleTapMs` also centres the RTS
   * camera on the group via `ctx.camera.panTo`. Needs `select`. While on, top-row and numpad digit keys
   * (except with Alt) no longer reach `game.input` action bindings. Inactive while typing or while a
   * menu blocks play controls. Browsers may keep Ctrl+1…9 for tab switching outside fullscreen.
   */
  controlGroups?: boolean | ControlGroupOptions;
  orderCommand?: string;
  contextMenu?: boolean;
  /** Route the primary ability's aim to the cursor world point instead of camera yaw/pitch (#22). */
  aim?: boolean;
  grabWorldItems?: boolean;
  pingCommand?: string;
  /** Right-click runs this command with `{ point, entity, object, aim }` when neither `orderCommand` nor `contextMenu` claims the click (#164.4). */
  secondaryCommand?: string;
}

/** Props handed to a `WorldOverlay` component (#542): explicit `ctx` access so canvas-layer VFX read live engine state directly, without an extra hook or a module-global workaround. */
export interface WorldOverlayProps {
  ctx: GameContext;
}

export interface RemotePlayersProps {
  ctx: GameContext;
  rows: readonly PresencePoseRow[];
}

export interface EntitySpriteConfig {
  url: string;
  width: number;
  height: number;
  y: number;
  clip?: { atlas: SpriteAtlas; animation: string };
}

export interface WorldItemRenderConfig {
  rarityStyle?: Record<string, RarityStyle>;
  filter?: readonly LootFilterRule[];
  pickupRadius?: number;
  beamHeight?: number;
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
  halfWidth?: number;
  height?: number;
  stepHeight?: number;
}

/** Movement-state clip set for `ModelAnimationConfig.states`: the shell reads the entity's live speed each frame and crossfades between these clips, so a walking mob animates without any game-side driver. */
export interface ModelAnimationStates {
  idle: string;
  walk: string;
  /** Clip name above `runSpeed`; omit to keep `walk` at any speed. */
  run?: string;
  strafeLeft?: string;
  strafeRight?: string;
  backward?: string;
  turn?: string;
  jump?: string;
  swim?: string;
  tread?: string;
  rootMotion?: boolean;
  /** Speed (world units/sec) above which the entity counts as moving. Default 0.5. */
  walkSpeed?: number;
  runSpeed?: number;
  /** Crossfade duration in seconds when the state changes. Default 0.2. */
  fadeSec?: number;
}

/** Rig playback for a `ModelConfig`'s GLTF animation clips — looping idles, one-shots, and held poses. */
export interface ModelAnimationConfig {
  auto?: true;
  /** Playback clock: real seconds (default), or entity-bound locally accepted clock progress after speed/timescale and before calendar scale. Requires an advancing accepted-progress clock; unbound previews use real seconds. */
  clock?: "real" | "game";
  /** Clip name to play; defaults to the GLB's first clip. */
  clip?: string;
  loop?: boolean;
  timeScale?: number;
  /** Hold the rig on a fixed frame instead of advancing it each tick. */
  paused?: boolean;
  /** Seek the clip to this time in seconds; combine with `paused: true` to hold a specific pose ("pose library" usage). */
  time?: number;
  states?: ModelAnimationStates | undefined;
  /**
   * Add the engine-authored humanoid actions (`Jump`, `Swim`, `Tread`, `Punch`, `Swing`, `Gather`,
   * `Hurt`, `Death`, see `@jgengine/core/anim/humanoidActions`) to a humanoid rig's own clips, posed
   * from its idle clip. A rig that already ships a clip of the same name keeps it; a rig the skeleton
   * standard cannot map as a full body gets none. `humanoidAnimation()` builds the matching config.
   */
  humanoidActions?: boolean;
  /**
   * One-shot clips keyed by event name, each played once over the locomotion state then released back to it.
   * Reserved keys `hit` and `death` auto-fire on this entity's `combat.hitReaction` / `entity.died`; any other
   * key fires when the game emits `entity.animation` (`ctx.game.playEntityAnimation(instanceId, event)`). A
   * `string[]` picks a random variant per trigger. `death` clamps on its final frame instead of returning.
   */
  oneShots?: Record<string, string | readonly string[]> | undefined;
  graph?: AnimGraph | undefined;
}

/**
 * Real PBR map URLs (e.g. `buildMaterialCatalog(...).resolve(id)!.maps` from `@jgengine/assets`)
 * layered onto a model's material — the seam for texturing an otherwise-flat/untextured GLB. Any
 * supported MaterialTextureRole may be omitted to keep the model's own map. Physical roles use the
 * renderer's physical material; map URLs and response parameters remain caller-owned.
 */
export interface ModelMaterialMaps extends Partial<Record<MaterialTextureRole, string>> {}

/** Per-entity PBR material override (#151.3) applied to every standard or physical material in the model's cloned scene graph. */
export interface ModelMaterialOverride extends MaterialSurfaceParameters {
  maps?: ModelMaterialMaps | undefined;
  rim?: ModelRimLight;
  /**
   * A scanned surface projected onto the model from its own geometry (triplanar, in metres), so a kit
   * model whose UVs only address a palette atlas still reads as stucco, brick, wood or cardboard:
   * `librarySurfaceScan("stucco/painted", { tint: 0 })` from `@jgengine/assets/catalogs/materialLibrary`.
   * `tint` 0 keeps the model's own colours and takes the scan's grain, normal and roughness; 1 paints
   * the scan's colour over them. Off on the `low` graphics tier and until the maps load.
   */
  scan?: TerrainDetailMaterialConfig;
  materials?: readonly string[];
}

export interface ModelRimLight {
  color?: string;
  /** Rim brightness. 0 disables it; ~0.3 is a subtle read, ~1.5 is a hard sci-fi edge. Default 0.6. */
  strength?: number;
  power?: number;
}

export interface ModelAttachment {
  slot: string;
  model: string | ModelConfig;
  position?: [number, number, number];
  /** Local Euler rotation (radians) applied at the bone. */
  rotation?: [number, number, number];
  scale?: number;
}

export interface ModelPart {
  model: string | ModelConfig;
  position?: [number, number, number];
  /** Local Euler rotation (radians) under the parent's transform. */
  rotation?: [number, number, number];
  scale?: number;
  role?: PartRole;
}

export interface ModelConfig {  url: string;
  scale?: number;
  targetHeight?: number;
  y?: number;
  /** How the model registers on its placement point. `"center"` (default) horizontally centers the measured footprint on the point and ground-snaps its lowest vertex to the point's Y — the correct behavior for corner-pivot modular kits. `"origin"` renders at the raw GLB origin (legacy). */
  anchor?: "center" | "origin";
  /** Measured footprint/center/minY; supplied automatically when the model resolves through an `@jgengine/assets` catalog. Required for `anchor: "center"` to take effect. */
  dims?: ModelDims | undefined;
  /** Opt-in compact collision mesh from the asset index; when present, collider auto-fit raycasts the actual triangles, so shots pass through holes in concave models (torus, archway) instead of hitting the fitted box. Supplied automatically for opted-in catalog assets. */
  collisionMesh?: CollisionMeshData;
  /** Per-entity PBR tint/finish override (#151.3); cloned onto each `MeshStandardMaterial` in the model so shared GLTF caches stay untouched. */
  material?: ModelMaterialOverride;
  surfaceDetail?: boolean | undefined;
  /**
   * Per-model wind sway for foliage: trunk and standing geometry stay planted while the upper
   * canopy drifts in the shared gust field. `strength` is metres of tip travel, `speed` the gust
   * rate, `height` the world height over which sway ramps in (defaults to the model's own height).
   * `false` or omitted keeps the model rigid. Compiles into each cloned material.
   */
  wind?: ModelWindConfig | false;
  materialAssets?: readonly MaterialAsset[] | undefined;  
  materialAssignments?: readonly MaterialAssignment[] | undefined;
  hiddenNodes?: readonly string[];
  /** Shadow participation of every mesh in the model. Default `"both"` (casts and receives); `"none"` for foliage cards, decals, or viewmodels that must never shadow the world. */
  shadows?: ModelShadowMode;
  /**
   * Plays a GLTF animation clip on the model when the source has any (skinned or not).
   * A model resolved from a catalog id whose index carries `clips` animates automatically —
   * semantic clip roles build the idle/walk/run states and hit/death/attack one-shots (see
   * `defaultAnimationForClips`). `"auto"` forces that derivation, `"none"` opts out (bind pose),
   * and an explicit config always wins. Omitted on a live entity it behaves as `"auto"`, so a rig
   * with an identifiable idle clip never stands in its bind pose; previews keep the bind pose.
   */
  animation?: ModelAnimationConfig | "auto" | "none" | undefined;
  /**
   * Runtime inverse kinematics for a rigged model, applied after the animation mixer each frame.
   * Feet follow slopes and steps while keeping each clip's swing lift, soles never sink below the
   * ground, the pelvis drops so the lower leg can reach, and the correction fades out while airborne.
   * `"auto"` finds the legs by bone name (`UpLeg`, `UpperLeg`, `Thigh`); bone names resolve on the
   * loaded scene. Unset on a live entity, the shell runs `"auto"` feet plus a head turn toward the
   * local player within a few metres, on every graphics tier but `low`, near the camera and until the
   * entity dies. `"none"` turns all of it off.
   */
  ik?: "auto" | "none" | ModelIkConfig;
  characterMotion?: CharacterMotionConfig | false;
  attachments?: readonly ModelAttachment[];
  /**
   * What this body draws in hand for each item id an entity of it may hold (`SceneEntity.held`, set
   * with `ctx.scene.entity.update(id, { held })`). Only the held item's attachment mounts; an item
   * with no entry, or empty hands, draws nothing. On a humanoid rig `slot: "hand.r"` / `"hand.l"` is
   * a socket in the character's own frame (metres, +Z forward, +Y up) at the wrist in the idle pose.
   */
  held?: Readonly<Record<string, ModelAttachment>>;
  worn?: Readonly<Record<string, WornLayer>>;
  looks?: Readonly<Record<string, Partial<Omit<ModelConfig, "looks">>>>;
  parts?: readonly ModelPart[];
  partMotion?: PartMotionParams;
  lod?: ModelLodConfig | false;
  /**
   * Ordered mesh detail levels — the full mesh plus decimated copies — switched per instance by
   * distance to the camera, so one species can keep full geometry near and a cheaper mesh far. Only
   * the instanced draw path swaps levels; a single-instance placement always draws `url`. See
   * {@link ModelVariantLodConfig} and `core/world/modelLod`.
   */
  variants?: ModelVariantLodConfig | undefined;
  meshLods?: Partial<MeshLodConfig> | false;
}

/**
 * Distance tiers for one character model. Distances are metres from the camera; every field is data
 * so a game can set its own thresholds per model and retune them without touching the engine.
 */
export interface ModelLodConfig {
  fullRateDistance?: number;
  halfRateDistance?: number;
  /**
   * At or beyond this distance a crowd-eligible character renders through the GPU batch path and
   * updates no bones. Default 25. `0` batches it at every distance, which is what a crowd or an army
   * wants: near members then draw from the same instance buffer instead of one rig each.
   */
  crowdDistance?: number;
  /** Metres a character must come back inside `crowdDistance` before it returns to its own rig, so the swap cannot flicker at the boundary. Default 2. */
  crowdHysteresis?: number;
  /**
   * Characters of this model one batch can draw. A character past the cap keeps its own rig, so a
   * crowded scene loses draws rather than characters. Default 128.
   */
  crowdCapacity?: number;
}

export interface ModelWindConfig {
  /** Tip travel in metres. Default 0.35. */
  strength?: number;
  speed?: number;
  /** World height over which sway ramps from the base to full tip travel, in metres. Defaults to the model's measured height. */
  height?: number;
  /** Wind heading as a two-axis direction; defaults to the engine's shared gust direction. */
  direction?: readonly [number, number];
}

export interface ModelIkConfig {
  feet?: readonly { root: string; mid: string; tip: string }[];
  /** Bone shifted down when a foot has to reach lower ground; defaults to the first thigh's parent. */
  pelvis?: string;
  maxAdjust?: number;
  /** Tilt planted feet to the ground normal, `0..1`. Default `1`. */
  alignToGround?: number;
  lookAt?: ModelLookAtConfig;
}

export interface ModelLookAtConfig {
  bone: string;
  target?: "camera" | { entity: string } | { point: readonly [number, number, number] };
  entityEyeHeight?: number;
  /** Yaw limit in radians; the head stops turning past it. Omitted means unconstrained. */
  maxYaw?: number;
  /** Pitch limit in radians. Omitted means unconstrained. */
  maxPitch?: number;
  /** How much of the solved turn reaches the bone, `0..1`. Default `1`. */
  weight?: number;
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
  shadowCameraSize?: number;
  /**
   * Cascade count for cascaded shadow maps (CSM). When `> 1` and `castShadow`, the shell mounts
   * three.js CSM so outdoor scenes keep shadows past a single ortho frustum. Default `1` (legacy
   * single map). Typical outdoor value: `3` or `4`.
   */
  cascades?: number;
  shadowMaxFar?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
  /** PCF penumbra width in shadow-map texels; 0 is a hard edge. Default 1.25. */
  shadowRadius?: number;
  /**
   * Angular diameter of the light in degrees, for soft shadows: the penumbra widens with it on every
   * shadow map while the player's soft-shadows setting is on (`SUN_ANGULAR_DIAMETER_DEG`, 0.53, is the
   * sun; larger reads as haze or an overcast sky). Never sharper than `shadowRadius`, never wider
   * than the tier's `softShadowMaxRadius`. Omitted keeps the fixed `shadowRadius`.
   */
  lightSize?: number;
  /** Metres from caster to ground the soft penumbra is sized for. Default 4. */
  occluderDistance?: number;
}

export interface HemisphereLightingConfig {
  skyColor?: string;
  groundColor?: string;
  intensity?: number;
}

/** A bounded dynamic point light in world space. */
export interface PointLightingConfig {
  color?: string;
  intensity?: number;
  position: readonly [number, number, number];
  distance?: number;
  decay?: number;
  castShadow?: boolean;
}
/** A bounded dynamic spot light in world space. */
export interface SpotLightingConfig extends PointLightingConfig {
  target?: readonly [number, number, number];
  angle?: number;
  penumbra?: number;
}

/** Declarative lighting replacing the shell's hardcoded ambient/directional default (#207.5); mounts regardless of world kind, only when supplied. */
export interface LightingConfig {
  ambient?: AmbientLightingConfig;
  directional?: readonly DirectionalLightingConfig[];
  point?: readonly PointLightingConfig[];
  spot?: readonly SpotLightingConfig[];
  maxDynamicLights?: number;
  hemisphere?: HemisphereLightingConfig;
  /**
   * Multiplier on `ambient` intensity while image-based light is on (every look but `"flat"`), so the
   * shaped sky light carries the fill instead of a flat wash. Default 0.5; 1 keeps the authored value.
   */
  iblAmbientScale?: number;
  fallbackKey?: boolean;
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

/** Free-flight families moved into the walk controller so one seam covers ground + air — creative/spectator/noclip/hover are weightless, aircraft, rotorcraft and rockets use `physics/aircraftDynamics`. */
export interface FlightConfig {
  mode?: "creative" | "spectator" | "noclip" | "hover";
  /** Horizontal base speed (units/s). Default: the flying entity's own `movement.walkSpeed` (so each mount flies at its own pace), else 8. */
  speed?: number;
  /** Vertical base speed for ascend/descend. Default = `speed`. */
  verticalSpeed?: number;
  sprintMultiplier?: number;
  acceleration?: number;
  gravity?: number;
  thrust?: number;
  alignWithLook?: boolean;
  collide?: boolean;
  bindings?: FreeFlightBindings;
  camera?: ChaseCameraTuning | null;
  canFly?: (ctx: GameContext) => boolean;
}

export interface MovementFeelConfig {
  groundAcceleration?: number;
  airAcceleration?: number;
  groundFriction?: number;
  runMultiplier?: number;
  crouchMultiplier?: number;
  /** A jump pressed up to this many ms before landing fires on landing (default 0). */
  jumpBufferMs?: number;
  /** A jump pressed up to this many ms after walking off a ledge still fires (default 0). */
  coyoteMs?: number;
  /** Rising speed kept when jump is released early, 0..1 (default 1: no cut). Lower makes a tap a hop. */
  jumpCutFactor?: number;
  apexGravityScale?: number;
  /** Vertical speed under which `apexGravityScale` applies, m/s (default 1.5). */
  apexSpeed?: number;
  fallGravityScale?: number;
  /** After landing, jumps wait and walk speed ramps back from `landingSpeedScale` over this many ms (default 0). */
  landingRecoveryMs?: number;
  landingSpeedScale?: number;
}

export interface PlayerMovementConfig {
  mode?: "free" | "axis" | "grid";
  axis?: "x" | "z";
  cellSize?: number;
  /**
   * Collide the walking player against placed scene objects' blocking colliders even without
   * `collision.voxel`. Default **true** — a placed object with a blocking physical collider stops,
   * supports, and is stood upon by the player; set `false` to walk through everything (ghost/spectator
   * modes, pure-board presentations). Objects that should never block should carry non-blocking
   * colliders instead of relying on this switch.
   */
  collideObjects?: boolean;
  /** Heightfield collision span from feet, finite and positive; default 1.8 meters. Live growth waits for clear headroom. Capsule and voxel paths retain their own dimensions; model proportions and camera placement remain game-owned. */
  collisionHeight?: number | undefined;
  /** Tallest object ledge stepped up while walking (and largest drop still snapped down instead of falling). Default 0.4. */
  stepHeight?: number | undefined;
  /** Intercepts each frame's resolved position before the pose commits (and before onTick): return a replacement [x,y,z] to constrain or redirect the step, or nothing to accept it. */
  beforeCommit?: (frame: MovementCommitFrame) => readonly [number, number, number] | undefined | void;
  /** Gates the built-in sprint (`runSpeedMultiplier`) behind live game state — a stamina stat, an encumbrance check (#282.3). Called each frame while sprint is held; `false` walks. */
  canSprint?: (ctx: GameContext) => boolean;
  backpedalMult?: number;
  /**
   * Walk-controller feel. Acceleration and friction are exponential response rates (1/s): higher reaches
   * the target velocity or stops sooner. Omitted fields keep the engine defaults, so nothing changes until a
   * game sets one. The heightfield and physics-backed capsule paths share jump feel; a `collision.voxel`
   * body retains press-frame jumping with plain gravity. Tune against `measureMovement` (`@jgengine/core/movement/movementProbe`).
   */
  feel?: MovementFeelConfig | undefined;
  /** Radians/second the rendered body rotates toward its movement heading (shortest arc), so strafing/backpedalling read as a turn rather than an instant flip; also the rate the internally-integrated `turnLeft`/`turnRight` heading turns when the shell doesn't own yaw. Unset = body facing snaps instantly (no change to existing feel). */
  turnSpeed?: number;
  swim?: { speedMultiplier?: number; dive?: SwimDiveConfig | boolean } | boolean;
  slopeSlide?: { maxClimbSlope?: number } | boolean;
  maxClimbGrade?: number | undefined;
  /**
   * Optional terrain-policy sampler for `maxClimbGrade`; defaults to the resolved ground sampler.
   * Use when grade rules follow a different terrain field (for example before road cuts). This
   * does not change foot grounding. Called at most four times per constrained walking step;
   * must return finite heights or the step throws with the invalid sampling coordinate.
   */
  climbGradeHeight?: (x: number, z: number) => number;
  /**
   * Free-flight — creative/spectator/noclip/hover — folded into the same walk controller so a game
   * doesn't hand-roll a second movement loop to get Minecraft-like flight. `true` uses creative defaults;
   * an object tunes speed/vertical/sprint/collide/canFly. Horizontal is always yaw-relative strafe
   * (A = left, D = right — never roll/bank), vertical is Space/Ctrl, and aircraft, rotorcraft and rockets
   * use `physics/aircraftDynamics`. The shell drives this automatically when present; `canFly` toggles
   * between walking and flying per tick without rebuilding the config.
   */
  flight?: FlightConfig | boolean;
}

export interface MovementCommitFrame {
  entityId: string;
  current: readonly [number, number, number];
  next: readonly [number, number, number];
  dt: number;
  /** The live game context (#282.2) — movement rules read stores/stats directly instead of module-level bridge objects. */
  ctx: GameContext;
}

/**
 * Per-channel combat presentation toggles for the 3D shell canvas.
 * Missing keys default to enabled when the parent `presentationEffects` is an object.
 */
export interface PresentationEffectsConfig {
  telegraphs?: boolean;
  vfx?: boolean;
  floatText?: boolean;
  /**
   * Straight muzzle→impact tracer lines for direct-fire shots. Opt-in (default false): unlike the
   * other channels, a missing `tracers` key leaves them OFF, because `fireProjectile` is a generic
   * seam and a tracer is only meaningful for a game that fires direct, bullet-like projectiles.
   * Arced/exploding shots (grenades, launchers) never draw a tracer even when this is on.
   */
  tracers?: boolean;
  shake?: boolean;
  hitMarkers?: boolean;
  /** A short flash where each direct-fire shot leaves the gun. Defaults to the `tracers` setting. */
  muzzleFlash?: boolean;
  impacts?: boolean | { classes?: Readonly<Record<string, ImpactClass>>; marks?: boolean; decals?: ImpactDecalsConfig; hitstop?: boolean; ragdolls?: boolean };
}

/**
 * One named framing in {@link GameCaptureConfig.views}: everything about a capture except the host-side
 * viewport (`--device`, `--size`) and `--mode`, which the runner routes on before the game module loads.
 * Every field mirrors the equivalent capture flag, and an explicit flag on the command line wins over the
 * shot's value so a declared framing stays a starting point rather than a cage.
 */
export interface GameCaptureView {
  description?: string;
  look?: string;
  lookFrom?: string;
  /** `--spawn`: `x,y,z` or `x,y,z,yaw`, for a shot framed from the player's vantage instead of a detached camera. */
  spawn?: string;
  state?: string;
  run?: readonly string[];
  /** `--settle`: milliseconds to wait before the frame, for a shot behind an animation. */
  settleMs?: number;
}

export type ProbeReadings = Readonly<Record<string, number>>;

/**
 * How a game makes itself screenshottable: the commands that reach live play or a named screen, the
 * framings worth re-capturing, and the progress metrics a bot playtest samples. Declaring these once
 * is what lets a capture host reproduce a view instead of re-deriving it by hand every run.
 */
export interface GameCaptureConfig<TProbe extends ProbeReadings = ProbeReadings> {
  /**
   * Commands run (in order, via `ctx.game.commands.run`) right after boot when a capture host requests the
   * play screen — the same commands the start-menu buttons dispatch. A bare string runs with a default input;
   * the object form carries the input a command needs (e.g. `[{ name: "class.select", input: { classId: "siren" } }, "startRun"]`).
   * A name the game never registers fails the capture loudly instead of shipping a menu screenshot.
   *
   * Timing contract: these dispatch **once**, synchronously, at `onContextReady` — after `onNewPlayer` but
   * before any async boot work it kicked off has settled. If the game restores state asynchronously (a
   * whole-world save load, network hydration) and that restore resets the same "started" gate these commands
   * flip, the restore lands *after* the play commands and re-shows the menu — the capture then fails with a
   * start menu still on screen even though `play` is declared. Make such a restore preserve an already-live
   * session (skip the reset when the start gate is already set) so it does not bounce capture back to the title.
   */
  play?: readonly (string | { name: string; input?: unknown })[];
  states?: Record<string, readonly (string | { name: string; input?: unknown })[]>;
  /**
   * Named framings worth re-capturing — the views a reviewer actually asks about (`street`, `keep-exterior`,
   * `boss-arena`), each pinning the camera, the staging, and the settle for that shot. `shoot <game> --view <name>`
   * reproduces one exactly, so a before/after pair is the same framing by construction instead of two hand-typed
   * flag sets that drifted. An unknown name fails the capture listing the declared views.
   */
  views?: Record<string, GameCaptureView>;
  /** Extra milliseconds the capture host waits after `play` commands before taking the play-mode screenshot — cover an intro cinematic or spawn-in fade. Default 2500. */
  settleMs?: number;
  probe?: (ctx: GameContext) => TProbe;
}

export interface GameSceneConfig<TWorldOverlay = unknown, TRenderEntity = never, TRenderObject = never, TViewmodel = unknown, TOverlay = TWorldOverlay, TRemotePlayers = unknown> {
  environment?: TWorldOverlay | EnvironmentSource | undefined;
  /** The game's authored scene document (`editor.scene.json`, normalized). When set, `defineGame` always mounts `AuthoredScene` over it (draped paths, scatter, studios, placed catalog props) — any `WorldOverlay` renders alongside it as VFX only — and the embedded editor opens it as its default layers: the zero-wiring path from document to play and edit modes. */
  editorLayers?: EditorDocument | undefined;
  editorCatalogs?: readonly EditorCatalogDefinition[] | undefined;
  /** Optional canvas-layer VFX component (e.g. traveling projectiles); receives `{ ctx }` (#542) so overlay VFX read live engine state without a separate hook or a module-global workaround. */
  WorldOverlay?: TOverlay | undefined;
  RemotePlayers?: TRemotePlayers | undefined;
  /** Custom first-person viewmodel (#542), read when the active rig is first-person. Rendered inside the shell's camera-locked, muzzle-tracked anchor in place of the built-in three-mesh gun; receives a live `cuesRef` (velocity/bob/firing/reloading/recoil) driven from the followed entity — see `@jgengine/core/camera/GameFirstPersonCamera.draw`'s `ViewmodelProps`. Set `camera.firstPerson.viewmodel: false` to render no viewmodel at all regardless of this field. */
  viewmodel?: TViewmodel | undefined;
  renderEntity?: TRenderEntity | undefined;
  renderObject?: TRenderObject | undefined;
  entitySprites?: Record<string, EntitySpriteConfig> | undefined;
  /** GLB models keyed by entity kind name; a string resolves as an asset-catalog key via game.assets, a ModelConfig renders directly. Takes priority over sprites, then primitives. */
  entityModels?: Record<string, string | ModelConfig> | undefined;
  /** GLB models keyed by object catalog id; a string resolves via game.assets, a ModelConfig renders directly. Replaces the colored box when present. */
  objectModels?: Record<string, string | ModelConfig> | undefined;
  objectStyles?: Record<string, ObjectStyle> | undefined;
  worldItem?: WorldItemRenderConfig | undefined;
  /** Opt in to world-space health bars floating over non-local entities that carry the stat. `roles` restricts bars to entities whose catalog entry declares one of the given roles; `maxDistance` hides bars beyond this many world units from the render camera, and unset derives the range from the camera and the target height (an overhead camera reaches the units it looks at). */
  worldHealthBars?:
    | boolean
    | {
        statId?: string;
        roles?: readonly CatalogEntityRole[];
        maxDistance?: number;
        maxSamples?: number;
        /** Minimum refresh interval in ms. Default 80 for bars, 120 for plates. */
        tickMs?: number;
        occlude?: boolean;
      } | undefined;
  /**
   * Opt in to billboarded nameplates (name + optional HP bar) floating over non-local entities — the
   * MMO "who's this and how hurt are they" readout. `roles` restricts to entities whose catalog entry
   * declares one of the given roles (default: all); `maxDistance` hides nameplates beyond this many
   * world units from the render camera, and unset derives the range the same way the bars do. Headless: skin every part via `className`/`data-*` hooks
   * on `WorldNameplates` (`@jgengine/core/hud/WorldHud.draw`) — this flag only turns the readout on and
   * scopes which entities it covers. Set `showHealth: false` for a name-only plate when a game already
   * draws the HP bar itself (its own HUD, or `worldHealthBars`) — otherwise the nameplate's built-in bar
   * stacks a second health bar over every entity.
   */
  nameplates?:
    | boolean
    | {
        statId?: string;
        roles?: readonly CatalogEntityRole[];
        maxDistance?: number;
        maxSamples?: number;
        /** Minimum refresh interval in ms. Default 80 for bars, 120 for plates. */
        tickMs?: number;
        showHealth?: boolean;
        occlude?: boolean;
        resolveName?: (entity: SceneEntity) => string | null;
      } | undefined;
  ambientLife?: AmbientLifeConfig | false | undefined;
  visibility?: VisibilityConfig | undefined;
  /**
   * Combat presentation stack mounted inside the 3D canvas (telegraphs, spell VFX, retained VFX,
   * float text, projectile tracers, camera shake). Default `true` preserves historical always-on
   * behavior. `false` mounts none. An object mounts only the listed pieces (missing keys default
   * on so games can disable a single expensive channel, e.g. `{ tracers: false }`).
   */
  presentationEffects?: boolean | PresentationEffectsConfig | undefined;
  characterMotion?: CharacterMotionConfig | false | undefined;
}

export interface GameRenderingConfig {
  look?: LookPreset | undefined;
  mood?: LookMood | undefined;
  /** Declarative ambient/directional/hemisphere lighting (#207.5); replaces the shell's hardcoded default lights when present, regardless of world kind. */
  lighting?: LightingConfig | undefined;
  environmentSource?: EnvironmentSource | undefined;
  /** Generic background/sky/fog (#207.6), applied for any world kind including a custom `environment` component. */
  backdrop?: BackdropConfig | undefined;
  postProcessing?: PostProcessingConfig | undefined;
  shadows?: boolean | undefined;
  graphics?: Partial<Record<"low" | "medium" | "high", Partial<GraphicsProfile>>> | undefined;
  /** Default painted finish on loaded models (normalized glTF params plus procedural mottling, wear and micro-normal, scaled by the graphics tier's `surfaceDetail`). Default true; `false` renders every model with its exported material. */
  surfaceDetail?: boolean | undefined;
}

export interface GameControlsConfig {
  hotbarSelection?: (() => number) | undefined;
  prompts?: ((ctx: GameContext) => readonly PositionedPrompt[]) | undefined;
  pointer?: PointerConfig | undefined;
  touch?: TouchControlsConfig | false | undefined;
  gamepad?: GamepadFeelConfig | undefined;
  /** Local seats on this screen for couch co-op. With `maxSlots > 1` each extra pad hot-joins its own seat on its first button press, the shell calls `loop.onNewPlayer(ctx, { userId, isNew: true })` for it, and its input lands on `localPlayers(ctx).local(slotId).input` instead of `ctx.input`. Unset keeps one seat: every device drives `ctx.player`. */
  localPlayers?: LocalPlayersConfig | undefined;
  viewports?: ViewportsConfig | undefined;
  orientation?: GameOrientation | undefined;
  /** Where the game is meant to be played. Default `["web", "mobile"]` — design-resolution HUD fit is on for every game: `HudCanvas` auto-scales from `hudFit.designSize` down to the live viewport, so the desktop layout shrinks to fit a phone instead of overflowing it. Declare `["web"]` to opt a desktop-only game out (compact displays fall back to the legacy fixed 0.85 zoom). */
  platforms?: readonly HudPlatform[] | undefined;
  hudFit?: HudViewportConfig | undefined;
  collision?: VoxelCollisionConfig | undefined;
  movement?: PlayerMovementConfig | undefined;
}

export interface GameChromeConfig {
  presentation?: "3d" | "hud" | undefined;
  devtools?: boolean | undefined;
  notices?: NoticePresentationConfig | false | undefined;
  settings?: GameSettingsConfig | false | undefined;
}

export interface PlayableGameContract<
  TUi = unknown,
  TWorldOverlay = unknown,
  TRenderEntity = never,
  TRenderObject = never,
  TViewmodel = unknown,
  TOverlay = TWorldOverlay,
  TProbe extends ProbeReadings = ProbeReadings,
  TRemotePlayers = unknown,
> {
  game: GameDefinition;
  content: GameContextContent;
  loop: Required<Omit<GameLoop<GameContext>, "onPlayerLeave">> & Pick<GameLoop<GameContext>, "onPlayerLeave">;
  GameUI: TUi;
  scene?: GameSceneConfig<TWorldOverlay, TRenderEntity, TRenderObject, TViewmodel, TOverlay, TRemotePlayers> | undefined;
  rendering?: GameRenderingConfig | undefined;
  controls?: GameControlsConfig | undefined;
  chrome?: GameChromeConfig | undefined;
  i18n?: I18n | undefined;
  camera?: GameCameraConfig;
  capture?: GameCaptureConfig<TProbe> | undefined;
  audio?: {
    sounds: Record<string, SoundDef>;
    maxVoices?: number;
    voiceOverflow?: "steal-lowest" | "reject";
    buses?: Record<string, AudioBusDef>;
    music?: Record<string, MusicTheme>;
    musicBus?: string;
    /** Bus whose volume sets spoken lines from `ctx.game.audio.speak` (radio DJs, announcers). Default: `musicBus`. */
    speechBus?: string;
    hudCues?: boolean;
    uiCues?: UiCueOverrides;
    feedbackCues?: FeedbackCueOverrides;
    /**
     * World-space ambience zones. While the listener is inside a zone the shell loops its bed on
     * the sound's own bus; walking between zones hands over across each floor's `crossfade`
     * distance, and leaving every zone fades to silence. Beds are retained, so a zone you return to
     * resumes without a seam.
     */
    zones?: readonly AmbienceZoneDef[];
    occlusion?: AudioOcclusionConfig | false;
    panning?: "hrtf" | "equalpower" | "off";
    /**
     * World reverb on positioned sounds, on by default: authored `zones` (sphere or box, each a
     * preset), else the shell listens for walls and a ceiling around the player and picks room, hall
     * or outdoor. `false` keeps every sound dry.
     */
    reverb?: AudioReverbConfig | false;
    adaptiveMusic?: boolean | AdaptiveMusicConfig;
    entitySounds?: Record<string, string> | undefined;
    objectSounds?: Record<string, string> | undefined;
  } | undefined;
}

export function worldHealthBarAllowsRole(
  roles: readonly CatalogEntityRole[] | undefined,
  role: CatalogEntityRole | undefined,
): boolean {
  if (roles === undefined) return true;
  return role !== undefined && roles.includes(role);
}
