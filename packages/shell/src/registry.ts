import type { ComponentType, ReactNode } from "react";
import type { PlayableGame as EnginePlayableGame } from "@jgengine/core/game/playableGame";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";

export type RenderEntity = (entity: SceneEntity) => ReactNode;

export type PlayableGame = EnginePlayableGame<ComponentType, ComponentType, RenderEntity>;

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;
