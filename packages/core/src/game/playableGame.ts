import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { GameContext, GameContextContent } from "../runtime/gameContext";
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
}

export interface EntitySpriteConfig {
  url: string;
  width: number;
  height: number;
  y: number;
}

export interface PlayableGame<TUi = unknown, TWorldOverlay = unknown> {
  game: GameDefinition;
  content: GameContextContent;
  loop: Required<GameLoop<GameContext>>;
  GameUI: TUi;
  /** Optional canvas-layer VFX component (e.g. traveling projectiles). */
  WorldOverlay?: TWorldOverlay;
  /** Billboard sprites keyed by entity kind name; unmatched entities get primitive markers. */
  entitySprites?: Record<string, EntitySpriteConfig>;
  /** GLB model asset catalog keys keyed by entity kind name; takes priority over entitySprites. */
  entityModels?: Record<string, string>;
  /** Optional scroll-selected hotbar index for primary ability (mouse0). */
  hotbarSelection?: () => number;
  /** Positioned proximity prompts for the interact key + HUD; single source shared with useActivePrompt. */
  prompts?: (ctx: GameContext) => readonly PositionedPrompt[];
  /** Camera tuning (perspective, orbit, first-person) for the dev game player shell. */
  camera?: GameCameraConfig;
  /** Opt in to world-space health bars floating over non-local entities that carry the stat. */
  worldHealthBars?: boolean | { statId?: string };
}
