import {
  agentsMd,
  artDirectionMd,
  browserLibMjs,
  driveMjs,
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
import type { EditorSceneDoc, TemplateFile, TemplateOptions } from "./templates/types";

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
  // Default on: the scaffold's own AGENTS.md calls flat untextured ground a failing result,
  // so shipping proxy geometry by default failed the standard the template hands the agent.
  const world = options.world ?? true;
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`game id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`);
  }
  const emptyScene: EditorSceneDoc = { version: 1, markers: [{ id: "player_spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }] };
  const sceneDoc = scene ?? (options.sceneMode === "starter" ? undefined : emptyScene);
  const sceneContents = sceneDoc ? `${JSON.stringify(sceneDoc, null, 2)}\n` : editorSceneJson;
  const sceneTest = sceneDoc ? (scene ? editorLayersTestFor(scene) : editorLayersTestFor(emptyScene)) : editorLayersTest;
  return [
    { path: "index.html", contents: indexHtml(name) },
    { path: "vite.config.ts", contents: viteConfig(variant) },
    {
      path: "package.json",
      contents: variant === "in-repo" ? inRepoPackageJson(id) : standalonePackageJson(id, engineVersion),
    },
    { path: "tsconfig.json", contents: tsconfigJson(variant) },
    { path: ".gitignore", contents: gitignore },
    { path: "scripts/browser.mjs", contents: browserLibMjs },
    { path: "scripts/shoot.mjs", contents: shootMjs },
    { path: "scripts/drive.mjs", contents: driveMjs },
    { path: "AGENTS.md", contents: agentsMd(name, variant) },
    { path: "src/index.css", contents: indexCss(variant, editor) },
    { path: "src/style.css", contents: styleCss },
    { path: "src/art-direction.md", contents: artDirectionMd },
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
          { path: "src/world.ts", contents: worldTs(id, options.ground) },
          { path: "src/game/assets.ts", contents: gameAssetsTs },
    { path: "src/game/models.ts", contents: gameModelsTs(options.player) },
        ]
      : []),
    { path: "src/game/ui/GameUI.tsx", contents: gameUiTsx(id, name, editor) },
  ];
}
