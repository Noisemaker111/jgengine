import {
  agentsMd,
  contentTs,
  editorCatalogsTest,
  editorCatalogsTs,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  gameAssetsTs,
  gameConfigTs,
  gameModelsTs,
  gameUiTsx,
  indexCss,
  indexHtml,
  indexTsx,
  inRepoPackageJson,
  keybindsTs,
  loopTs,
  mainTsx,
  standalonePackageJson,
  styleCss,
  tsconfigJson,
  tuningTs,
  viteConfig,
  worldTest,
  worldTs,
} from "./templates/gameFiles";
import { GAME_ID_PATTERN } from "./templates/names";
import type { TemplateFile, TemplateOptions } from "./templates/types";

export { editorScaffold } from "./templates/editorWorkspace";
export { IN_REPO_TSCONFIG_PATHS } from "./templates/gameFiles";
export {
  displayNameFromId,
  displayNameFromInput,
  folderNameFromTitle,
  FOLDER_NAME_PATTERN,
  GAME_ID_PATTERN,
  packageIdFromFolder,
  parseCreateName,
} from "./templates/names";
export type {
  EditorSceneDoc,
  EditorSceneMarker,
  TemplateFile,
  TemplateOptions,
  TemplateVariant,
} from "./templates/types";

/** @internal */
export function gameTemplate(options: TemplateOptions): TemplateFile[] {
  const { id, name, variant, engineVersion, scene } = options;
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`game id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`);
  }
  const sceneContents = scene ? `${JSON.stringify(scene, null, 2)}\n` : editorSceneJson;
  const sceneTest = scene ? editorLayersTestFor(scene) : editorLayersTest;
  return [
    { path: "index.html", contents: indexHtml(name) },
    { path: "vite.config.ts", contents: viteConfig(variant) },
    {
      path: "package.json",
      contents: variant === "in-repo" ? inRepoPackageJson(id) : standalonePackageJson(id, engineVersion),
    },
    { path: "tsconfig.json", contents: tsconfigJson(variant) },
    { path: "AGENTS.md", contents: agentsMd(name, variant) },
    { path: "src/index.css", contents: indexCss(variant) },
    { path: "src/style.css", contents: styleCss },
    { path: "src/main.tsx", contents: mainTsx(id) },
    { path: "src/index.tsx", contents: indexTsx },
    { path: "src/editor.scene.json", contents: sceneContents },
    { path: "src/editorLayers.ts", contents: editorLayersTs },
    { path: "src/editorLayers.test.ts", contents: sceneTest },
    { path: "src/editorCatalogs.ts", contents: editorCatalogsTs },
    { path: "src/editorCatalogs.test.ts", contents: editorCatalogsTest },
    { path: "src/game.config.ts", contents: gameConfigTs(name) },
    { path: "src/loop.ts", contents: loopTs },
    { path: "src/world.ts", contents: worldTs(id) },
    { path: "src/game/assets.ts", contents: gameAssetsTs },
    { path: "src/game/models.ts", contents: gameModelsTs },
    { path: "src/game/tuning.ts", contents: tuningTs },
    { path: "src/game/content.ts", contents: contentTs },
    { path: "src/game/keybinds.ts", contents: keybindsTs },
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(id, name) },
    { path: "src/game/world.world.test.ts", contents: worldTest(id) },
  ];
}
