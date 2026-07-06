import type { ComponentType } from "react";
import type { PlayableGame as EnginePlayableGame } from "@jgengine/core/game/playableGame";

export type PlayableGame = EnginePlayableGame<ComponentType, ComponentType>;

export type GameRegistry = Record<string, () => Promise<PlayableGame>>;
