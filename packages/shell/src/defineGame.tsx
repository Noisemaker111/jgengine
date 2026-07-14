import type { ComponentType } from "react";

import {
  defineGame as defineEngineGame,
  type GameDefinitionConfig,
  type GameLoop,
} from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { EnvironmentScene } from "./environment";
import type { PlayableGame } from "./registry";

type EngineFields<TAssetRef extends ModelAssetRef> = Omit<
  GameDefinitionConfig<TAssetRef>,
  "loop" | "ui" | "multiplayer"
> & { multiplayer?: GameDefinitionConfig<TAssetRef>["multiplayer"] };

type PresentationFields = Omit<PlayableGame, "game" | "content" | "loop" | "GameUI"> & {
  content?: GameContextContent;
  loop?: Partial<GameLoop<GameContext>>;
  GameUI?: ComponentType;
};

export type GameConfig<TAssetRef extends ModelAssetRef = ModelAssetRef> = EngineFields<TAssetRef> &
  PresentationFields;

const noop = (): void => {};

function worldBackdrop(feature: EnvironmentWorldFeature): ComponentType {
  return function WorldBackdrop() {
    return <EnvironmentScene feature={feature} />;
  };
}

const emptyUi: ComponentType = () => null;

export function defineGame<TAssetRef extends ModelAssetRef = ModelAssetRef>(
  config: GameConfig<TAssetRef>,
): PlayableGame {
  const {
    content,
    loop,
    GameUI,
    environment,
    camera,
    multiplayer,
    WorldOverlay,
    viewmodel,
    renderEntity,
    renderObject,
    entitySprites,
    entityModels,
    objectModels,
    hotbarSelection,
    prompts,
    pointer,
    touch,
    orientation,
    worldHealthBars,
    nameplates,
    audio,
    entitySounds,
    objectSounds,
    worldItem,
    collision,
    movement,
    lighting,
    backdrop,
    postProcessing,
    shadows,
    presentation,
    objectStyles,
    devtools,
    capture,
    platforms,
    hudFit,
    ...engineFields
  } = config;

  const game = defineEngineGame({ ...engineFields, multiplayer: multiplayer ?? offline() });

  return {
    game,
    content: content ?? {},
    loop: {
      onInit: loop?.onInit ?? noop,
      onNewPlayer: loop?.onNewPlayer ?? noop,
      onTick: loop?.onTick ?? noop,
      onPlayerLeave: loop?.onPlayerLeave ?? noop,
    },
    GameUI: GameUI ?? emptyUi,
    environment:
      environment ??
      (game.world?.kind === "environment" ? worldBackdrop(game.world) : undefined),
    camera: camera ?? { perspective: "third" },
    WorldOverlay,
    viewmodel,
    renderEntity,
    renderObject,
    entitySprites,
    entityModels,
    objectModels,
    hotbarSelection,
    prompts,
    pointer,
    touch,
    orientation,
    worldHealthBars,
    nameplates,
    audio,
    entitySounds,
    objectSounds,
    worldItem,
    collision,
    movement,
    lighting,
    backdrop,
    postProcessing,
    shadows,
    presentation,
    objectStyles,
    devtools,
    capture,
    platforms,
    hudFit,
  };
}
