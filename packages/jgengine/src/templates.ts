import { cliVersion } from "./pkg";
import { sharedBuilderFiles } from "./templates/sharedBuilder";
import {
  boardGameConfigTs,
  boardGameUiTsx,
  boardLoopTs,
  boardRulesTest,
  boardRulesTs,
  boardWorldTs,
} from "./templates/boardFiles";
import { withLandformStart, withStarterTerrain } from "./templates/starterTerrain";
import {
  agentsMd,
  artDirectionMd,
  editorLayersTest,
  editorLayersTestFor,
  editorLayersTs,
  editorSceneJson,
  grownEditorLayersTs,
  STARTER_ENVIRONMENT,
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
  standalonePackageJson,
  styleCss,
  tsconfigJson,
  viteConfig,
  worldTs,
} from "./templates/gameFiles";
import { GAME_ID_PATTERN } from "./templates/names";
import {
  perfBudgetJson,
  planMd,
  readmeMd,
  starterCreditsTs,
  starterFromZeroFlow,
  starterKitTs,
  starterProbeTs,
  starterRulesTest,
  starterRulesTs,
  walkFromZeroFlow,
  walkProbeTs,
  type StarterGameOptions,
} from "./templates/starterGame";
import type { EditorSceneDoc, TemplateFile, TemplateOptions } from "./templates/types";

export { editorScaffold } from "./templates/editorWorkspace";
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
  LandformStartName,
  TemplateFile,
  TemplateOptions,
  TemplateVariant,
} from "./templates/types";
export { LANDFORM_START_NAMES } from "./templates/types";

/** @internal */
export function gameTemplate(options: TemplateOptions): TemplateFile[] {
  const { id, name, variant, engineVersion, scene } = options;
  const board = options.dimension === "2d";
  const editor = !board && (options.editor ?? true);
  // Default on: the scaffold's own AGENTS.md calls flat untextured ground a failing result,
  // so shipping proxy geometry by default failed the standard the template hands the agent.
  const world = !board && (options.world ?? true);
  if (!GAME_ID_PATTERN.test(id)) {
    throw new Error(`game id "${id}" must be kebab-case: lowercase letters, digits, dashes, starting with a letter`);
  }
  const emptyScene: EditorSceneDoc = {
    version: 1,
    markers: [{ id: "player_spawn", kind: "player_spawn", position: { x: 0, y: 0, z: 0 } }],
    environment: STARTER_ENVIRONMENT,
  };
  const sceneDoc = scene ?? (options.sceneMode === "empty" ? emptyScene : undefined);
  const baseSceneContents = sceneDoc ? `${JSON.stringify(sceneDoc, null, 2)}\n` : editorSceneJson;
  // A promoted --from-scene document keeps whatever ground its author made.
  const landform = world && editor && scene === undefined ? options.landform : undefined;
  const seedsTerrain = world && (options.ground ?? "terrain") === "terrain" && scene === undefined && landform === undefined;
  const sceneContents = landform !== undefined ? withLandformStart(baseSceneContents, landform, id) : seedsTerrain ? withStarterTerrain(baseSceneContents, id) : baseSceneContents;
  const sceneTest = sceneDoc ? (scene ? editorLayersTestFor(scene) : editorLayersTestFor(emptyScene)) : editorLayersTest;
  const builder = options.shape === "shared-world-builder";
  // The starter loop reads the starter scene's caches and beacon; any other scene starts from a walk.
  const loop = world && editor && sceneDoc === undefined && !builder;
  const flow = world && !builder;
  const plan: StarterGameOptions = {
    id,
    name,
    brief: options.brief,
    template: board ? "2d" : builder ? "builder" : "3d",
    loop,
    player: options.player,
    ground: options.ground ?? "terrain",
  };
  const files: TemplateFile[] = [
    { path: "index.html", contents: indexHtml(name) },
    { path: "vite.config.ts", contents: viteConfig(variant) },
    {
      path: "package.json",
      contents: variant === "in-repo" ? inRepoPackageJson(id) : standalonePackageJson(id, engineVersion, options.cliVersion ?? cliVersion(), editor),
    },
    { path: "tsconfig.json", contents: tsconfigJson(variant) },
    // An in-repo game lives under the monorepo's own .gitignore and AGENTS.md.
    ...(variant === "in-repo"
      ? []
      : [
          { path: ".gitignore", contents: gitignore },
          { path: "AGENTS.md", contents: agentsMd(name, variant) },
        ]),
    { path: "src/index.css", contents: indexCss(variant, editor) },
    { path: "src/style.css", contents: styleCss },
    { path: "src/art-direction.md", contents: artDirectionMd },
    { path: "src/main.tsx", contents: mainTsx(editor, variant, id) },
    { path: "src/index.tsx", contents: indexTsx(editor) },
    ...(editor
      ? [
          { path: "src/editor.scene.json", contents: sceneContents },
          { path: "src/editorLayers.ts", contents: landform === undefined ? editorLayersTs : grownEditorLayersTs },
          { path: "src/editorLayers.test.ts", contents: sceneTest },
        ]
      : []),
    ...(board
      ? [
          { path: "src/game.config.ts", contents: boardGameConfigTs(name) },
          { path: "src/world.ts", contents: boardWorldTs(id) },
          { path: "src/loop.ts", contents: boardLoopTs },
          { path: "src/game/board.ts", contents: boardRulesTs },
          { path: "src/game/board.test.ts", contents: boardRulesTest },
        ]
      : [
          { path: "src/game.config.ts", contents: gameConfigTs(name, { world, editor, loop, flow }) },
          { path: "src/loop.ts", contents: loopTs(editor, loop) },
          { path: "src/game/probe.ts", contents: loop ? starterProbeTs : walkProbeTs },
          { path: "src/game/ui/kit.ts", contents: starterKitTs },
          { path: "src/game/credits.ts", contents: starterCreditsTs },
          ...(loop
            ? [
                { path: "src/game/rules.ts", contents: starterRulesTs },
                { path: "src/game/rules.test.ts", contents: starterRulesTest },
              ]
            : []),
          ...(flow
            ? [
                { path: "proofs/flows/from-zero.flow.ts", contents: loop ? starterFromZeroFlow : walkFromZeroFlow },
                { path: "README.md", contents: readmeMd(plan) },
              ]
            : []),
        ]),
    { path: "PLAN.md", contents: planMd(plan) },
    { path: "perf-budget.json", contents: perfBudgetJson },
    ...(world
      ? [
          { path: "src/world.ts", contents: worldTs(id, options.ground, editor) },
          { path: "src/game/assets.ts", contents: gameAssetsTs },
    { path: "src/game/models.ts", contents: gameModelsTs(options.player) },
        ]
      : []),
    { path: "src/game/ui/GameUI.tsx", contents: board ? boardGameUiTsx(name) : gameUiTsx(id, name, editor, loop) },
  ];
  return options.shape === "shared-world-builder" ? sharedBuilderFiles(files, options) : files;
}
