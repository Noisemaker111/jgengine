import type { ComponentType, ReactNode } from "react";
import type { PlayableGame as EnginePlayableGame, WorldOverlayProps } from "@jgengine/core/game/playableGame";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { HudTheme } from "@jgengine/react/hudTheme";
import type { ViewmodelProps } from "./camera/GameFirstPersonCamera";

export type RenderEntity = (entity: SceneEntity) => ReactNode;
export type RenderObject = (object: SceneObject) => ReactNode;

/** The concrete React-bound playable a shell `defineGame` returns and `GameHost` mounts — the one PlayableGame games handle. */
export type PlayableGame = EnginePlayableGame<
  ComponentType,
  ComponentType,
  RenderEntity,
  RenderObject,
  ComponentType<ViewmodelProps>,
  ComponentType<WorldOverlayProps>
> & {
  /** HUD theme the shell applies at the `GameUI` root. Unset uses `defaultHudTheme`; `false` opts out of the default theme and the engine's generic HUD control styling. A theme the game sets inside `GameUI` still wins. */
  hudTheme?: HudTheme | false;
};

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;

export function resolveGameLoader(
  registry: GameRegistry,
  gameId: string,
  fallbackGameId?: string,
): (() => Promise<PlayableGame>) | undefined {
  return registry[gameId] ?? (fallbackGameId === undefined ? undefined : registry[fallbackGameId]);
}
