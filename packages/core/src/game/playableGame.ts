import type { AudioBusDef, SoundDef } from "../audio/audioFalloff";
import type { MusicTheme } from "../audio/music";
import type { EditorCatalogDefinition, EditorDocument } from "../editor/types";
import type { PostProcessingConfig } from "../render/postProcessing";
import type { LookPreset } from "../render/lookPreset";
import type { TouchControlsConfig } from "../input/touchScheme";
import type { GameSettingsConfig } from "../settings/settingsModel";
import type { GameOrientation } from "../ui/orientation";
import type { HudPlatform, HudViewportConfig } from "../ui/hudScale";
import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { CatalogEntityRole, GameContext, GameContextContent } from "../runtime/gameContext";
import type { ModelDims } from "../scene/assetCatalog";
import type { PartMotionParams, PartRole } from "./partAnimation";
import type { CollisionMeshData } from "../scene/collisionMesh";
import type { SkyEnvironmentConfig } from "../world/features";
import type { VisibilityConfig } from "../visibility/config";
import type { GameDefinition, GameLoop } from "./defineGame";
import type { GameCameraConfig } from "./cameraConfig";
import type { LootFilterRule } from "./lootFilter";
import type { RarityStyle } from "./worldItem";

export type {
  CameraFollowState,
  CameraKeyframe,
  CameraProjection,
  CameraRigKind,
  CameraShakeConfig,
  ChaseCameraConfig,
  ChaseView,
  CinematicCameraConfig,
  FirstPersonCameraConfig,
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
} from "./cameraConfig";
export { CAMERA_FRUSTUM_DEFAULTS } from "./cameraConfig";

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

/** Props handed to a `WorldOverlay` component (#542): explicit `ctx` access so canvas-layer VFX read live engine state directly, without an extra hook or a module-global workaround. */
export interface WorldOverlayProps {
  ctx: GameContext;
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
  /**
   * Semantic motion role for a rig-less part-composed character (see `game/partAnimation`).
   * Tagging any part enables the shell's procedural driver on an entity model: legs and arms swing
   * counter-phase with movement speed, the head counter-sways, tails wag, wings flap, and the whole
   * composition gains walk bob, idle breathe, hit flinch, and a death topple. Untagged parts stay
   * static kit pieces.
   */
  role?: PartRole;
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
  /** Opt-in compact collision mesh from the asset index; when present, collider auto-fit raycasts the actual triangles, so shots pass through holes in concave models (torus, archway) instead of hitting the fitted box. Supplied automatically for opted-in catalog assets. */
  collisionMesh?: CollisionMeshData;
  /** Per-entity PBR tint/finish override (#151.3); cloned onto each `MeshStandardMaterial` in the model so shared GLTF caches stay untouched. */
  material?: ModelMaterialOverride;
  /** Plays a GLTF animation clip on the model when the source has any (skinned or not); omit to render the rig's bind pose. */
  animation?: ModelAnimationConfig;
  /** Props/weapons parented to named bones on this model's rig; each follows its bone through animation. */
  attachments?: readonly ModelAttachment[];
  /** Static kit-of-parts pieces stacked at fixed local offsets — no bone/rig involved. Use this for a compound entity assembled from several modular meshes (a castle keep from base + mid + roof pieces); use `attachments` for props parented to an animated rig's bones. Tag parts with a `role` to procedurally animate a rig-less character composition. */
  parts?: readonly ModelPart[];
  /** Tuning for the procedural part-motion driver when any part carries a `role`; omit for defaults. */
  partMotion?: PartMotionParams;
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

/**
 * Per-channel combat presentation toggles for the 3D shell canvas.
 * Missing keys default to enabled when the parent `presentationEffects` is an object.
 */
export interface PresentationEffectsConfig {
  /** Ground telegraphs for AoE / cast indicators. Default true. */
  telegraphs?: boolean;
  /** One-shot spell VFX + retained (persistent) VFX instances. Default true. */
  vfx?: boolean;
  /** Floating combat text (damage numbers, etc.). Default true. */
  floatText?: boolean;
  /** Projectile tracer lines. Default true. */
  tracers?: boolean;
  /** Trauma-driven combat camera shake. Default true. */
  shake?: boolean;
}

/** How a screenshot host reaches live gameplay in this game — the data behind `shoot --mode play`. */
export interface GameCaptureConfig {
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
  /** The game's authored scene document (`editor.scene.json`, normalized). When set, `defineGame` always mounts `AuthoredScene` over it (draped paths, scatter, studios, placed catalog props) — any `WorldOverlay` renders alongside it as VFX only — and the embedded editor opens it as its default layers: the zero-wiring path from document to play and edit modes. */
  editorLayers?: EditorDocument;
  /** Game-exported gameplay catalog definitions (schemas + defaults). `GameHost` forwards them to the summoned editor's Data panel; no per-game editor bootstrap needed. */
  editorCatalogs?: readonly EditorCatalogDefinition[];
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
  /**
   * Combat presentation stack mounted inside the 3D canvas (telegraphs, spell VFX, retained VFX,
   * float text, projectile tracers, camera shake). Default `true` preserves historical always-on
   * behavior. `false` mounts none. An object mounts only the listed pieces (missing keys default
   * on so games can disable a single expensive channel, e.g. `{ tracers: false }`).
   */
  presentationEffects?: boolean | PresentationEffectsConfig;
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
