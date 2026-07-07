import type { AudioBusDef, SoundDef } from "../audio/audioFalloff";
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

export interface GameCameraConfig {
  /** "third" mounts the orbit camera (default); "first" mounts pointer-lock mouse-look. */
  perspective?: "third" | "first";
  /** First-person tuning; only read when perspective is "first". */
  firstPerson?: FirstPersonCameraConfig;
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
  /** Instance id to follow; defaults to local player in the dev shell. */
  followEntityId?: string;
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
  /** Sound catalog + mix buses (music/sfx/ambient/…) the shell's Web Audio glue plays from. Catalog-first — no per-game audio wiring. */
  audio?: { sounds: Record<string, SoundDef>; buses?: Record<string, AudioBusDef> };
  /** Continuous positional emitter keyed by entity kind name: while a matching entity exists, the shell plays and repositions the mapped `audio.sounds` id (looping engine hum, campfire crackle, footstep loop) with listener-distance falloff. */
  entitySounds?: Record<string, string>;
  /** Same as `entitySounds` but keyed by placed-object catalog id (torches, machinery). */
  objectSounds?: Record<string, string>;
}
