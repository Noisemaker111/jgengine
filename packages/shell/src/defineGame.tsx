import { useMemo, type ComponentType } from "react";

import type { EditorDocument } from "@jgengine/core/editor/types";
import {
  defineGameDefinition as defineEngineGame,
  type GameDefinitionConfig,
  type GameLoop,
} from "@jgengine/core/game/defineGame";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { AssetCatalog, ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { EnvironmentWorldFeature } from "@jgengine/core/world/features";

import { EnvironmentScene } from "./environment";
import { terrainGroundColorSampler } from "./environment/terrainGroundColor";
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
  /** Tunes how the auto-mounted `AuthoredScene` places the document's catalog-id markers into the object store. Default `true`; pass `false` when the game spawns its placed content as entities itself (`placeAuthoredObjects`) to avoid a double render. */
  scenePlacement?: boolean | { verticalOffset?: number };
  /** GLB models for the auto-mounted scene's scatter palette items, keyed by palette item id; string ids resolve through the game's asset catalog. Unmatched items keep the built-in proxy meshes. */
  sceneScatterModels?: Record<string, string | ModelConfig>;
};

export type GameConfig<TAssetRef extends ModelAssetRef = ModelAssetRef> = EngineFields<TAssetRef> &
  PresentationFields;

const noop = (): void => {};

function worldBackdrop(feature: EnvironmentWorldFeature): ComponentType {
  return function WorldBackdrop() {
    return <EnvironmentScene feature={feature} />;
  };
}

function authoredSceneOverlay(
  document: EditorDocument,
  placement: boolean | { verticalOffset?: number },
  scatterModels: Record<string, string | ModelConfig> | undefined,
  assets: AssetCatalog,
  world: GameDefinitionConfig<ModelAssetRef>["world"],
  Vfx: ComponentType<WorldOverlayProps> | undefined,
): ComponentType<WorldOverlayProps> {
  const terrain = world !== undefined && world.kind === "environment" ? world.terrain : undefined;
  return function AuthoredSceneOverlay(props: WorldOverlayProps) {
    const groundColorAt = useMemo(
      () => terrainGroundColorSampler(terrain, props.ctx.world.ground),
      [props.ctx.world.ground],
    );
    return (
      <>
        <AuthoredScene
          document={document}
          field={props.ctx.world.ground}
          placeObjects={placement}
          {...(scatterModels === undefined ? {} : { scatterModels, assets })}
          {...(groundColorAt === undefined ? {} : { groundColorAt })}
        />
        {Vfx === undefined ? null : <Vfx {...props} />}
      </>
    );
  };
}

const emptyUi: ComponentType = () => null;

/**
 * The one public authoring entry point: compose engine fields (systems, world, physics, input) and
 * presentation fields (camera, HUD, audio, authored scene) into a `PlayableGame` ready for `GameHost`.
 * Defaults to solo/offline multiplayer; `editorLayers` auto-mounts the authored scene document.
 *
 * @capability define-game single public game-authoring path — compose systems, world, presentation, and authored scene in one definition
 */
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
    editorCatalogs,
    scenePlacement,
    sceneScatterModels,
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
    editorCatalogs,
    WorldOverlay:
      editorLayers === undefined
        ? WorldOverlay
        : authoredSceneOverlay(
            editorLayers,
            scenePlacement ?? true,
            sceneScatterModels,
            game.assets,
            game.world,
            WorldOverlay,
          ),
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
