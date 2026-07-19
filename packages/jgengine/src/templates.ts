import {
  agentsMd,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  gameAssetsTs,
  gameConfigTs,
  gameModelsTs,
  gameUiTsx,
  gitignore,
  indexCss,
  indexHtml,
  indexTsx,
  inRepoPackageJson,
  loopTs,
  mainTsx,
  shootMjs,
  standalonePackageJson,
  styleCss,
  tsconfigJson,
  viteConfig,
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
  const editor = options.editor ?? true;
  const world = options.world ?? false;
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
    { path: ".gitignore", contents: gitignore },
    { path: "scripts/shoot.mjs", contents: shootMjs },
    { path: "AGENTS.md", contents: agentsMd(name, variant) },
    { path: "src/index.css", contents: indexCss(variant) },
    { path: "src/style.css", contents: styleCss },
    { path: "src/main.tsx", contents: mainTsx(editor) },
    { path: "src/index.tsx", contents: indexTsx(editor) },
    ...(editor
      ? [
          { path: "src/editor.scene.json", contents: sceneContents },
          { path: "src/editorLayers.ts", contents: editorLayersTs },
          { path: "src/editorLayers.test.ts", contents: sceneTest },
        ]
      : []),
    { path: "src/game.config.ts", contents: gameConfigTs(name, { world, editor }) },
    { path: "src/loop.ts", contents: loopTs(editor) },
    ...(world
      ? [
          { path: "src/world.ts", contents: worldTs(id) },
          { path: "src/game/assets.ts", contents: gameAssetsTs },
          { path: "src/game/models.ts", contents: gameModelsTs },
        ]
      : []),
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(id, name, editor) },
  ];
}
