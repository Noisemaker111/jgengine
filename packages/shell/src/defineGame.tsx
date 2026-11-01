import { useMemo, type ComponentType } from "react";

import type { EditorDocument } from "@jgengine/core/editor/types";
import {
  defineGameDefinition as defineEngineGame,
  type GameDefinitionConfig,
  type GameLoop,
} from "@jgengine/core/game/defineGame";
import { syncLifecyclePhase } from "@jgengine/core/game/gamePhase";
import type { GameCaptureConfig, LightingConfig, ProbeReadings, WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { offline } from "@jgengine/core/runtime/adapter";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { AssetCatalog, ModelAssetRef } from "@jgengine/core/scene/assetCatalog";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterGeneratorItem } from "@jgengine/core/scatter/scatterGenerator";
import type { ScatterSolidSpec } from "@jgengine/core/scatter/scatterSolids";
import type { EnvironmentWorldFeature, SkyEnvironmentConfig } from "@jgengine/core/world/features";
import type { EnvironmentSource } from "@jgengine/core/lighting/environmentLighting";
import { lightingFromDocument, skyFromDocument } from "@jgengine/core/editor/environment";
import { resolveGameLook } from "@jgengine/core/render/lookPreset";
import type { ResolveAuthoredObjectsOptions } from "@jgengine/core/world/authoredObjects";

import { EnvironmentScene } from "@jgengine/core/environment/EnvironmentScene.draw";
import { terrainGroundColorSampler } from "@jgengine/core/terrain/terrainGroundColor.draw";
import type { PlayableGame } from "./registry";
import { AuthoredScene } from "@jgengine/core/scene/AuthoredScene.draw";

type EngineFields<TAssetRef extends ModelAssetRef> = Omit<
  GameDefinitionConfig<TAssetRef>,
  "loop" | "ui" | "multiplayer"
> & { multiplayer?: GameDefinitionConfig<TAssetRef>["multiplayer"] };

type PresentationFields<TProbe extends ProbeReadings> = Omit<PlayableGame<TProbe>, "game" | "content" | "loop" | "GameUI" | "capture"> & {
  /** How capture hosts reach play and named screens, and the numbers `capture.probe` reports to proof flows. */
  capture?: GameCaptureConfig<TProbe>;
  content?: GameContextContent;
  loop?: Partial<GameLoop<GameContext>>;
  GameUI?: ComponentType;
  /** Tunes how the auto-mounted `AuthoredScene` places catalog-id markers into the object store. Default `true`; `excludeKinds` replaces the resolver's mob/boss exclusions, so include those when adding game-owned spawn kinds. Pass `false` when the game places all content itself. */
  scenePlacement?: boolean | ({ verticalOffset?: number } & ResolveAuthoredObjectsOptions);
  /** What the auto-mounted scene's scatter palette items draw, keyed by palette item id: a GLB (`ModelConfig`, or a string id resolved through the game's asset catalog) or a generator (`{ generator: "plant.grown", params, variants }`, see `ScatterGeneratorItem`). Unmatched items keep the built-in proxy meshes. */
  sceneScatterModels?: Record<string, string | ModelConfig | ScatterGeneratorItem>;
  /** Most scatter instances the auto-mounted scene draws; past it the foliage thins evenly. Default 20000 — raise it for a whole-island world. */
  sceneScatterBudget?: number;
  /** Palette items whose placements block movement, keyed by palette item id: `{ radius, height }` in metres at scale 1 (see `ScatterSolidSpec`). Unlisted items stay walk-through. */
  sceneScatterSolids?: Readonly<Record<string, ScatterSolidSpec>>;
  /** Animated species models for cosmetic authored habitats; gameplay actors remain game-owned. */
  sceneFlockModels?: Record<string, string | ModelConfig>;
  /** Visible ground path kinds; omit to draw every non-scatter path, or restrict to keep flight/patrol guides out of world roads. */
  scenePathKinds?: readonly string[];
};

export type GameConfig<TAssetRef extends ModelAssetRef = ModelAssetRef, TProbe extends ProbeReadings = ProbeReadings> = EngineFields<TAssetRef> &
  PresentationFields<TProbe>;

const noop = (): void => {};

function worldBackdrop(feature: EnvironmentWorldFeature): ComponentType {
  return function WorldBackdrop() {
    return <EnvironmentScene feature={feature} />;
  };
}

/** The scene document's sky fields, or undefined when its environment authors none (point lights only). */
function documentSkyOf(doc: EditorDocument | undefined): SkyEnvironmentConfig | undefined {
  const sky = doc === undefined ? undefined : skyFromDocument(doc);
  return sky === undefined || Object.keys(sky).length === 0 ? undefined : sky;
}

/** The lamps a scene document places (light markers, environment point lights). */
function documentLamps(doc: EditorDocument | undefined): LightingConfig | undefined {
  if (doc === undefined) return undefined;
  return lightingFromDocument(doc) ?? (doc.environment?.pointLights === undefined ? undefined : { point: doc.environment.pointLights });
}

function isEnvironmentSource(value: unknown): value is EnvironmentSource {
  return typeof value === "object" && value !== null && "kind" in value && ["gradient", "hdri", "cube"].includes((value as { kind?: unknown }).kind as string);
}

function authoredSceneOverlay(
  document: EditorDocument,
  diagnostics: boolean,
  placement: boolean | ({ verticalOffset?: number } & ResolveAuthoredObjectsOptions),
  scatterModels: Record<string, string | ModelConfig | ScatterGeneratorItem> | undefined,
  scatterBudget: number | undefined,
  scatterSolids: Readonly<Record<string, ScatterSolidSpec>> | undefined,
  flockModels: Record<string, string | ModelConfig> | undefined,
  pathKinds: readonly string[] | undefined,
  assets: AssetCatalog,
  world: GameDefinitionConfig<ModelAssetRef>["world"],
  Vfx: ComponentType<WorldOverlayProps> | undefined,
): ComponentType<WorldOverlayProps> {
  const terrain = world !== undefined && world.kind === "environment" ? world.terrain : undefined;
  return function AuthoredSceneOverlay(props: WorldOverlayProps) {
    const groundColorAt = useMemo(
      () => terrainGroundColorSampler(terrain, props.ctx.world.ground, document.terrain),
      [props.ctx.world.ground],
    );
    return (
      <>
        <AuthoredScene
          document={document}
          diagnostics={diagnostics}
          field={props.ctx.world.ground}
          placeObjects={placement}
          assets={assets}
          {...(scatterModels === undefined ? {} : { scatterModels })}
          {...(scatterBudget === undefined ? {} : { scatterBudget })}
          {...(scatterSolids === undefined ? {} : { scatterSolids })}
          {...(flockModels === undefined ? {} : { flockModels })}
          {...(pathKinds === undefined ? {} : { pathKinds })}
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
export function defineGame<TAssetRef extends ModelAssetRef = ModelAssetRef, TProbe extends ProbeReadings = ProbeReadings>(
  config: GameConfig<TAssetRef, TProbe>,
): PlayableGame<TProbe> {
  const {
    content,
    loop,
    GameUI,
    camera,
    multiplayer,
    scene,
    rendering,
    controls,
    chrome,
    scenePlacement,
    sceneScatterModels,
    sceneScatterBudget,
    sceneScatterSolids,
    sceneFlockModels,
    scenePathKinds,
    audio,
    capture,
    hudTheme,
    uiKit,
    health,
    ...engineFields
  } = config;
  const {
    environment,
    editorLayers,
    editorCatalogs,
    WorldOverlay,
    viewmodel,
    renderEntity,
    renderObject,
    entitySprites,
    entityModels,
    objectModels,
    objectStyles,
    worldItem,
    worldHealthBars,
    nameplates,
    ambientLife,
    visibility,
    presentationEffects,
    characterMotion,
  } = scene ?? {};
  const {
    look,
    mood,
    lighting: authoredLighting,
    environmentSource,
    backdrop,
    postProcessing,
    shadows,
    graphics,
    surfaceDetail,
  } = rendering ?? {};
  const { devtools, presentation, notices, settings } = chrome ?? {};

  const game = defineEngineGame({
    ...engineFields,
    ...(editorLayers === undefined ? {} : { authoredDocument: editorLayers }),
    multiplayer: multiplayer ?? offline(),
    loop: { ...loop, onDispose(ctx) { try { loop?.onDispose?.(ctx); } finally { ctx.environment.dispose(); } } },
  });
  // The world's sky shape and the scene document's sky fields layer under the look and mood; the
  // document's lamps join the rig the mood lights. Explicit game fields win over all of them.
  const resolvedLook = resolveGameLook({
    look,
    mood,
    lighting: authoredLighting ?? documentLamps(editorLayers),
    backdrop,
    postProcessing,
    worldSky: engineFields.world?.kind === "environment" ? engineFields.world.sky : undefined,
    documentSky: documentSkyOf(editorLayers),
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
    scene: {
      environment: isEnvironmentSource(environment) ? undefined :
        environment ??
        (game.world?.kind === "environment" ? worldBackdrop(game.world) : undefined),
      editorLayers,
      editorCatalogs,
      WorldOverlay:
        editorLayers === undefined
          ? WorldOverlay
          : authoredSceneOverlay(
              editorLayers,
              devtools !== false,
              scenePlacement ?? true,
              sceneScatterModels,
              sceneScatterBudget,
              sceneScatterSolids,
              sceneFlockModels,
              scenePathKinds,
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
      objectStyles,
      worldItem,
      worldHealthBars,
      nameplates,
      ambientLife,
      visibility,
      presentationEffects,
      characterMotion,
    },
    rendering: {
      lighting: resolvedLook.lighting,
      environmentSource: environmentSource ?? (isEnvironmentSource(environment) ? environment : undefined),
      look,
      mood,
      backdrop: resolvedLook.backdrop,
      postProcessing: resolvedLook.postProcessing,
      shadows,
      graphics,
      surfaceDetail,
    },
    controls,
    chrome: { presentation, settings, notices, devtools },
    camera: camera ?? { perspective: "third" },
    audio,
    capture,
    hudTheme,
    uiKit,
    health,
  };
}
