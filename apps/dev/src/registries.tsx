/**
 * Runner registries: the `import.meta.glob` discovery that turns every
 * `Games/*` folder into lazy game/preview/editor loaders, the built-in demo
 * registry, and the camera-preset overlay. All loaders are lazy — importing
 * this module scans no game code until something is actually requested.
 */
import type { ComponentType } from "react";

import { devtools } from "@jgengine/core/devtools/devtools";
import type { GameCameraConfig } from "@jgengine/core/game/playableGame";
import { applyStoredDevtoolsOverrides } from "@jgengine/shell/devtools/DevtoolsOverlay";
import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import type { GameRegistry, PlayableGame } from "@jgengine/shell/registry";

import { CAM } from "./appEnv";

const CAMERA_PRESETS: Record<string, GameCameraConfig> = {
  orbit: { rig: "orbit" },
  first: { rig: "first" },
  topdown: { rig: "topDown", topDown: { yaw: 0, pitch: 1.35, height: 20 } },
  iso: { rig: "topDown", topDown: { yaw: Math.PI / 4, pitch: 0.95, height: 18 } },
  rts: { rig: "rts", rts: { yaw: Math.PI / 5, pitch: 1.0, height: 22, panSpeed: 26 } },
  shoulder: { rig: "shoulder", shoulder: { shoulderOffset: 0.7, distance: 3.4, heightOffset: 1.6 } },
  lockon: { rig: "lockOn", lockOn: { distance: 5.5, height: 2.6, framingBias: 0.55 } },
  chase: { rig: "chase", chase: { distance: 6.5, height: 2.8, fov: { base: 55, max: 82, speedForMax: 12 } } },
  cockpit: { rig: "chase", chase: { view: "cockpit" } },
  rear: { rig: "chase", chase: { view: "rear" } },
  observer: {
    rig: "observer",
    observer: { bind: { kind: "entity", entityId: "sensor-showcase-culprit" }, distance: 7, height: 3.5, orbitSpeed: 0.3 },
  },
  side2d: { rig: "sideScroll", projection: "orthographic" },
};

export function withCameraPreset(game: PlayableGame): PlayableGame {
  if (CAM === null) return game;
  const preset = CAMERA_PRESETS[CAM];
  if (preset === undefined) return game;
  return { ...game, camera: { ...game.camera, ...preset } };
}

const gameModules = import.meta.glob<{
  game: PlayableGame;
  uiScenario?: UiPreviewScenario;
  editorLayers?: import("@jgengine/core/editor/index").EditorLayersInput;
  editorCatalogs?: import("@jgengine/core/editor/index").EditorCatalogsInput;
}>("../../../Games/*/src/index.tsx");

const gameStyleModules = import.meta.glob<Record<string, unknown>>("../../../Games/*/src/style.css");

const gameSourceModules = import.meta.glob<Record<string, unknown>>([
  "../../../Games/*/src/**/*.{ts,tsx}",
  "!**/main.tsx",
  "!**/*.test.*",
]);

export async function loadGameStyle(gameId: string): Promise<void> {
  await gameStyleModules[`../../../Games/${gameId}/src/style.css`]?.();
}

export async function discoverGameTunables(gameId: string, gameName: string): Promise<void> {
  const prefix = `../../../Games/${gameId}/src/`;
  const loaders = Object.entries(gameSourceModules).filter(([path]) => path.startsWith(prefix));
  const loaded = await Promise.all(
    loaders.map(async ([path, loader]) => {
      try {
        return await loader();
      } catch (error) {
        console.warn(`[jgengine:devtools] skipped ${path} during tunable discovery`, error);
        return null;
      }
    }),
  );
  for (const moduleExports of loaded) {
    if (moduleExports !== null) devtools.discover.scanModule(moduleExports);
  }
  applyStoredDevtoolsOverrides(gameName);
}

export const gameLoaders = Object.entries(gameModules).map(
  ([path, loader]) => [path.split("/").at(-3)!, loader] as const,
);

const gameEntries = Object.fromEntries(
  gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.game)]),
);

const editorSceneModules = import.meta.glob<{ default: unknown }>(
  "../../../Games/*/src/editor.scene.json",
);

const editorSceneRegistry: Partial<Record<string, () => Promise<unknown>>> = Object.fromEntries(
  Object.entries(editorSceneModules).map(([path, loader]) => [
    path.split("/").at(-3)!,
    () => loader().then((module) => module.default),
  ]),
);

export const editorLayerRegistry: Partial<
  Record<string, () => Promise<import("@jgengine/core/editor/index").EditorLayersInput | undefined>>
> = Object.fromEntries(
  gameLoaders.map(([id, loader]) => [
    id,
    async () => {
      const [module, editorModule, savedScene] = await Promise.all([
        loader(),
        import("@jgengine/core/editor/index"),
        editorSceneRegistry[id]?.() ?? Promise.resolve(undefined),
      ]);
      if (savedScene === undefined) return module.editorLayers;
      const base = editorModule.normalizeEditorLayers(module.editorLayers ?? null);
      const overlay = editorModule.normalizeEditorLayers(
        savedScene as import("@jgengine/core/editor/index").EditorLayersInput,
      );
      return editorModule.applyEditorDocumentOverlay(base, overlay);
    },
  ]),
);

export const gameRegistry: GameRegistry = {
  demo: () => import("./demo/demoGame").then((module) => module.demoGame),
  "pointer-commander": () =>
    import("./demo/pointerDemo").then((module) => module.pointerDemoGame),
  "environment-showcase": () =>
    import("./demo/environmentShowcase").then((module) => module.environmentShowcaseGame),
  "survival-demo": () =>
    import("./demo/survivalDemo").then((module) => module.survivalDemoGame),
  "builder-sandbox": () =>
    import("./demo/builderDemo").then((module) => module.builderDemoGame),
  "hud-showcase": () =>
    import("./demo/hudDemo").then((module) => module.hudShowcaseGame),
  "bookcase-stage": () =>
    import("./demo/bookcaseStageDemo").then((module) => module.bookcaseStageGame),
  "extraction-map": () => import("./demo/mapDemo").then((module) => module.mapDemoGame),
  "codex": () => import("./demo/codexDemo").then((module) => module.codexDemoGame),
  "notification-center": () => import("./demo/notificationDemo").then((module) => module.notificationDemoGame),
  "floating-text": () => import("./demo/floatingTextDemo").then((module) => module.floatingTextDemoGame),
  "coach-marks": () => import("./demo/coachMarksDemo").then((module) => module.coachMarksDemoGame),
  "objective-banner": () => import("./demo/objectiveBannerDemo").then((module) => module.objectiveBannerDemoGame),
  "interaction-prompt": () => import("./demo/interactionPromptDemo").then((module) => module.interactionPromptDemoGame),
  "scoreboard": () => import("./demo/scoreboardDemo").then((module) => module.scoreboardDemoGame),
  "talent-tree": () => import("./demo/talentTreeDemo").then((module) => module.talentTreeDemoGame),
  "countdown-timer": () => import("./demo/countdownTimerDemo").then((module) => module.countdownTimerDemoGame),
  "dialogue": () => import("./demo/dialogueDemo").then((module) => module.dialogueDemoGame),
  "damage-direction": () => import("./demo/damageDirectionDemo").then((module) => module.damageDirectionDemoGame),
  "day-night": () => import("./demo/dayNightDemo").then((module) => module.dayNightDemoGame),
  "status-effects": () => import("./demo/statusEffectDemo").then((module) => module.statusEffectDemoGame),
  "cutscene": () => import("./demo/cutsceneDemo").then((module) => module.cutsceneDemoGame),
  "pause-menu": () => import("./demo/pauseMenuDemo").then((module) => module.pauseMenuDemoGame),
  "screen-effects": () => import("./demo/screenEffectsDemo").then((module) => module.screenEffectsDemoGame),
  "fast-travel": () => import("./demo/fastTravelDemo").then((module) => module.fastTravelDemoGame),
  "particle-vfx": () => import("./demo/particleDemo").then((module) => module.particleDemoGame),
  "photo-mode": () => import("./demo/photoModeDemo").then((module) => module.photoModeDemoGame),
  "radial-menu": () => import("./demo/radialDemo").then((module) => module.radialDemoGame),
  "accessibility": () => import("./demo/accessibilityDemo").then((module) => module.accessibilityDemoGame),
  "quest-tracker": () => import("./demo/questDemo").then((module) => module.questDemoGame),
  "localization": () => import("./demo/localizationDemo").then((module) => module.localizationDemoGame),
  "world-pings": () => import("./demo/worldPingDemo").then((module) => module.worldPingDemoGame),
  "sensor-showcase": () =>
    import("./demo/sensorShowcase").then((module) => module.sensorShowcaseGame),
  "social-hub": () =>
    import("./demo/socialHubDemo").then((module) => module.socialHubGame),
  ...gameEntries,
};

export const uiScenarioRegistry: Partial<Record<string, () => Promise<UiPreviewScenario | undefined>>> =
  Object.fromEntries(
    gameLoaders.map(([id, loader]) => [id, () => loader().then((module) => module.uiScenario)]),
  );

export type PreviewComponent = ComponentType<{ className?: string }>;

const previewModules = import.meta.glob<{
  default: PreviewComponent;
  states?: Record<string, PreviewComponent>;
}>("../../../Games/*/src/preview.tsx");

export const previewLoaders = Object.fromEntries(
  Object.entries(previewModules).map(([path, loader]) => [path.split("/").at(-3)!, loader] as const),
);
