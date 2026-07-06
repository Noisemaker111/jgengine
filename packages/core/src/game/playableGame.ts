import type { PositionedPrompt } from "../interaction/proximityPrompt";
import type { GameContext, GameContextContent } from "../runtime/gameContext";
import type { GameDefinition, GameLoop } from "./defineGame";

export interface CameraFollowState {
  entityId: string;
  target: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  distance: number;
}

export interface GameCameraConfig {
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

export interface ModelConfig {
  url: string;
  scale?: number;
  y?: number;
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
  /** GLB models keyed by entity kind name; take priority over sprites, which take priority over primitives. */
  entityModels?: Record<string, ModelConfig>;
  /** GLB models keyed by object catalog id; replace the colored box when present. */
  objectModels?: Record<string, ModelConfig>;
  /** Optional scroll-selected hotbar index for primary ability (mouse0). */
  hotbarSelection?: () => number;
  /** Positioned proximity prompts for the interact key + HUD; single source shared with useActivePrompt. */
  prompts?: (ctx: GameContext) => readonly PositionedPrompt[];
  /** Third-person orbit camera tuning for the dev game player shell. */
  camera?: GameCameraConfig;
}
