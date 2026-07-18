import type { ComponentType } from "react";

import type { EditorDocument } from "@jgengine/core/editor/types";
import {
  defineGame as defineEngineGame,
  type GameDefinitionConfig,
  type GameLoop,
} from "@jgengine/core/game/defineGame";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { EnvironmentScene } from "./environment";
import type { PlayableGame } from "./registry";
import { AuthoredScene } from "./scene/AuthoredScene";

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

function authoredSceneOverlay(document: EditorDocument): ComponentType<WorldOverlayProps> {
  return function AuthoredSceneOverlay({ ctx }: WorldOverlayProps) {
    return <AuthoredScene document={document} field={ctx.world.ground} placeObjects />;
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
    editorLayers,
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
    presentationEffects,
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

  const game = defineEngineGame({
    ...engineFields,
    multiplayer: multiplayer ?? offline(),
    loop,
  });

  function withPhaseSync<A extends unknown[]>(
    inner: ((ctx: GameContext, ...args: A) => void) | undefined,
  ): (ctx: GameContext, ...args: A) => void {
    return (ctx, ...args) => {
      inner?.(ctx, ...args);
      syncLifecyclePhase(ctx, game.lifecycle);
    };
  }

  const composed = game.loop;

  return {
    game,
    content: content ?? {},
    loop: {
      onInit: withPhaseSync(composed?.onInit),
      onNewPlayer: withPhaseSync(composed?.onNewPlayer),
      onTick: withPhaseSync(composed?.onTick),
      onPlayerLeave: composed?.onPlayerLeave ?? noop,
      onReset: composed?.onReset?.bind(composed) ?? noop,
      onDispose: composed?.onDispose?.bind(composed) ?? noop,
    },
    GameUI: GameUI ?? emptyUi,
    environment:
      environment ??
      (game.world?.kind === "environment" ? worldBackdrop(game.world) : undefined),
    camera: camera ?? { perspective: "third" },
    editorLayers,
    WorldOverlay:
      WorldOverlay ?? (editorLayers === undefined ? undefined : authoredSceneOverlay(editorLayers)),
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
    presentationEffects,
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
