import type { ComponentType, ReactNode } from "react";
import type { PlayableGame as EnginePlayableGame } from "@jgengine/core/game/playableGame";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

export type RenderEntity = (entity: SceneEntity) => ReactNode;
export type RenderObject = (object: SceneObject) => ReactNode;

export type PlayableGame = EnginePlayableGame<ComponentType, ComponentType, RenderEntity, RenderObject>;

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;

export function resolveGameLoader(
  registry: GameRegistry,
  gameId: string,
  fallbackGameId?: string,
): (() => Promise<PlayableGame>) | undefined {
  return registry[gameId] ?? (fallbackGameId === undefined ? undefined : registry[fallbackGameId]);
}
