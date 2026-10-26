import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { cliVersion, findWorkspaceRoot, flag, hasFlag, isEngineMonorepo, pickPackageManager, sdkVersion } from "./pkg";
import { GAME_TEMPLATES, type GameTemplate, PROJECT_CONFIG_FILE, renderProjectConfig } from "./projectConfig";
import { installSkills } from "./skills";
import { applySync, planSync, syncContext } from "./sync";
import { type EditorSceneDoc, gameTemplate, parseCreateName, type TemplateVariant } from "./templates";

/** @internal */
export function writeGame(
  targetDir: string,
  id: string,
  name: string,
  variant: TemplateVariant,
  scene?: EditorSceneDoc,
  options?: {
    shape?: "shared-world-builder";
    world?: boolean;
    editor?: boolean;
    player?: string;
    ground?: "flat" | "terrain";
    sceneMode?: "empty" | "starter";
    dimension?: "2d" | "3d";
  },
): void {
  for (const file of gameTemplate({ id, name, variant, engineVersion: sdkVersion(), cliVersion: cliVersion(), scene, ...options })) {
    const dest = join(targetDir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }
}

const PLAYER_SPAWN_KIND = "player_spawn";

/**
 * Read an authored scene for the promote flow. `pathArg` may point at a folder holding an
 * `editor.scene.json` (what the standalone editor writes) or directly at a `.json` scene file. The
 * returned document always carries a `player_spawn` marker so the promoted game is walkable from the
 * scene that was authored — one is added at the origin only when the scene doesn't already have one.
 * @internal
 */
export function readPromotedScene(pathArg: string): EditorSceneDoc {
  const resolved = resolve(pathArg);
  if (!existsSync(resolved)) {
    throw new Error(`--from-scene path not found: ${resolved}`);
  }
  const scenePath = statSync(resolved).isDirectory() ? join(resolved, "editor.scene.json") : resolved;
  if (!existsSync(scenePath)) {
    throw new Error(`--from-scene: no editor.scene.json in ${resolved} (author one in the editor and save first)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(scenePath, "utf8"));
  } catch (error) {
    throw new Error(`--from-scene: ${scenePath} is not valid JSON (${error instanceof Error ? error.message : error})`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`--from-scene: ${scenePath} is not a scene document (expected an object with "markers")`);
  }

  const scene = parsed as EditorSceneDoc;
  const markers = Array.isArray(scene.markers) ? [...scene.markers] : [];
  if (!markers.some((marker) => marker.kind === PLAYER_SPAWN_KIND)) {
    markers.unshift({
      id: PLAYER_SPAWN_KIND,
      kind: PLAYER_SPAWN_KIND,
      position: { x: 0, y: 0, z: 0 },
      label: "Player spawn",
      color: "#22d3ee",
    });
  }
  return { version: 1, ...scene, markers };
}

const VALUE_FLAGS = new Set(["--pm", "--template", "--from-scene", "--player", "--ground", "--scene"]);
const BOOLEAN_FLAGS = new Set([
  "--no-editor",
  "--in-repo",
  "--standalone",
  "--no-install",
  "--no-skills",
  "--no-assets",
]);

const CREATE_USAGE = `usage: jgengine create "<Game Name>" [flags]

  --template 3d|2d|builder   3d: a world with terrain, sky, player model and editor scene (default)
                             2d: a board game drawn by GameUI, no 3D scene, editor or models
                             (grid, card and tile games); takes none of the 3D flags below
                             builder: a 3d world players build in together, on Convex
  --player <asset id>        starter player model (default asset:person_casual)
  --ground terrain|flat      starter ground (default terrain)
  --scene empty|starter      empty scene, or the old starter props (default empty)
  --from-scene <folder>      promote an authored editor.scene.json into the game
  --no-editor                drop the editor scene files
  The game's jgengine.json records what it is and uses; edit it, then run jgengine sync.
  --in-repo | --standalone   force the variant (auto-detected from the cwd)
  --no-install | --no-skills | --no-assets
  --pm bun|npm|pnpm`;

function unknownFlag(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (VALUE_FLAGS.has(arg)) index += 1;
    else if (arg.startsWith("-") && !BOOLEAN_FLAGS.has(arg)) return arg;
  }
  return undefined;
}

function positionalArg(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

function splitCreateArg(arg: string): { parentHint: string | null; titlePart: string } {
  const normalized = arg.replace(/\\/g, "/").replace(/\/+/g, "/");
  const trimmed = normalized.replace(/\/$/, "");
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return { parentHint: null, titlePart: trimmed };
  return {
    parentHint: trimmed.slice(0, slash) || ".",
    titlePart: trimmed.slice(slash + 1),
  };
}

function isInsideDir(child: string, parent: string): boolean {
  const resolvedChild = resolve(child);
  const resolvedParent = resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + sep);
}

function runInstall(pm: string, targetDir: string): ReturnType<typeof spawnSync> {
  return spawnSync(pm, ["install"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

/**
 * The one command that fills `public/models` for a scaffolded game. `starter` is a meta-id the
 * assets CLI resolves to every pack the starter catalog needs, so this stays a single line in
 * create's output, in AGENTS.md, and in the user's terminal.
 */
export const ASSETS_PULL_HINT = "npx assets pull starter";

/**
 * Pull the starter packs into the new game's `public/models`. Returns false on any failure —
 * offline, a blocked proxy, a missing bin — so the caller can print {@link ASSETS_PULL_HINT}
 * rather than fail a scaffold over a network condition.
 */
function runAssetsPull(targetDir: string): boolean {
  const bin = join(targetDir, "node_modules", ".bin", process.platform === "win32" ? "assets.cmd" : "assets");
  if (!existsSync(bin)) return false;
  const result = spawnSync(bin, ["pull", "starter"], {
    cwd: targetDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

/** The new game's `jgengine.json`: its template, and the engine packages the template put in package.json. */
function writeProjectConfig(targetDir: string, game: { id: string; name: string; template: GameTemplate; editor: boolean }): void {
  const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const engine = Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith("@jgengine/"))
    .map((name) => name.slice("@jgengine/".length));
  writeFileSync(
    join(targetDir, PROJECT_CONFIG_FILE),
    renderProjectConfig({ name: game.name, id: game.id, template: game.template, ...(game.template === "2d" ? {} : { editor: game.editor }), engine }),
  );
}

/** @internal */
export async function runCreate(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(CREATE_USAGE);
    return 0;
  }
  const badFlag = unknownFlag(argv);
  if (badFlag !== undefined) {
    console.error(`error: unknown flag ${badFlag}\n\n${CREATE_USAGE}`);
    return 1;
  }
  const nameArg = positionalArg(argv);
  if (nameArg === undefined) {
    console.error(CREATE_USAGE);
    return 1;
  }

  let displayName: string;
  let folderName: string;
  let id: string;
  try {
    const template = (flag(argv, "template") ?? "3d") as GameTemplate;
    if (!GAME_TEMPLATES.includes(template)) throw new Error(`--template must be one of ${GAME_TEMPLATES.join(", ")} (got ${template})`);
    const shape = template === "builder" ? ("shared-world-builder" as const) : undefined;
    const sceneArg = flag(argv, "from-scene");
    const player = flag(argv, "player");
    const ground = flag(argv, "ground") ?? "terrain";
    const sceneMode = flag(argv, "scene") ?? "empty";
    if (ground !== "flat" && ground !== "terrain") throw new Error(`--ground must be flat or terrain (got ${ground})`);
    if (sceneMode !== "empty" && sceneMode !== "starter") throw new Error(`--scene must be empty or starter (got ${sceneMode})`);
    const dimension = template === "2d" ? "2d" : "3d";
    if (dimension === "2d") {
      const threeDOnly = ["player", "ground", "scene", "from-scene"].filter((name) => flag(argv, name) !== undefined);
      const clash = [...threeDOnly, ...(hasFlag(argv, "no-editor") ? ["no-editor"] : [])];
      if (clash.length > 0) throw new Error(`--template 2d has no 3D scene; drop ${clash.map((name) => `--${name}`).join(", ")}`);
    }
    const scene = sceneArg !== undefined ? readPromotedScene(sceneArg) : undefined;
    const world = dimension === "3d";
    const editor = dimension === "3d" && !hasFlag(argv, "no-editor");
    if (!editor && scene !== undefined) {
      console.error("error: --from-scene needs the editor scaffold — drop --no-editor");
      return 1;
    }

    const { parentHint, titlePart } = splitCreateArg(nameArg);
    ({ displayName, folderName, id } = parseCreateName(titlePart));

    let parentDir = parentHint !== null ? resolve(parentHint) : process.cwd();
    let targetDir = join(parentDir, folderName);

    const workspaceRoot =
      findWorkspaceRoot(dirname(targetDir)) ?? findWorkspaceRoot(parentDir) ?? findWorkspaceRoot(process.cwd());
    const insideEngineRepo = workspaceRoot !== null && isEngineMonorepo(workspaceRoot);

    const variant: TemplateVariant = hasFlag(argv, "standalone")
      ? "standalone"
      : hasFlag(argv, "in-repo") || insideEngineRepo
        ? "in-repo"
        : "standalone";

    if (variant === "in-repo") {
      if (!insideEngineRepo || workspaceRoot === null) {
        console.error(
          "error: --in-repo requires the jgengine engine monorepo (packages/core + games/)",
        );
        return 1;
      }
      if (parentHint === null) {
        parentDir = join(workspaceRoot, "games");
        targetDir = join(parentDir, folderName);
      }
      const gamesDir = join(workspaceRoot, "games");
      if (!isInsideDir(targetDir, gamesDir)) {
        console.error(
          `error: in-repo games must live under games/ (got ${targetDir}; expected under ${gamesDir})`,
        );
        return 1;
      }
    }

    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      console.error(`error: ${targetDir} already exists and is not empty`);
      return 1;
    }

    const engineVersion = sdkVersion();
    writeGame(targetDir, id, displayName, variant, scene, { world, editor, player, ground, sceneMode, shape, dimension });
    writeProjectConfig(targetDir, { id, name: displayName, template, editor });
    applySync(targetDir, planSync(targetDir, await syncContext(targetDir)));
    console.log(`created ${displayName} (${template}, ${variant}) → ${targetDir}`);
    console.log(`  folder ${folderName}  package ${id}  name "${displayName}"`);
    if (variant === "standalone") {
      console.log(`  scaffolding @jgengine/* ^${engineVersion} (jgengine CLI ${cliVersion()})`);
    }
    if (scene !== undefined) {
      console.log(`  promoted authored scene from ${resolve(sceneArg!)} → src/editor.scene.json`);
    }

    if (variant === "in-repo" && workspaceRoot !== null) {
      console.log("\nnext steps:");
      console.log(`  bun install                     # from ${workspaceRoot}`);
      console.log(`  bun --cwd=games/${folderName} run dev   # play it standalone`);
      console.log(`  # agent: open the project and build ${displayName} (skills live in the monorepo)`);
      return 0;
    }

    let installed = false;
    if (!hasFlag(argv, "no-install")) {
      const pm = pickPackageManager(flag(argv, "pm"));
      console.log(`installing dependencies with ${pm}…`);
      let install = runInstall(pm, targetDir);
      if (install.status !== 0) {
        console.error("install failed — retrying once (registry propagation can lag a fresh publish)…");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
        install = runInstall(pm, targetDir);
      }
      installed = install.status === 0;
      if (!installed) console.error(`warning: ${pm} install failed — run it manually in ${targetDir}`);
    }

    // Starter models are not shipped inside @jgengine/assets (it publishes dist + an `assets` CLI),
    // so a 3d scaffold points at /models with nothing behind it until they are pulled. Do it
    // here so the default scaffold actually renders textured content rather than placeholders.
    // Needs node_modules for the `assets` bin, and never fails the scaffold: offline, proxied and
    // air-gapped machines get the exact command instead of a dead create.
    let assetsPulled = false;
    const wantAssets = world && !hasFlag(argv, "no-assets");
    if (wantAssets && installed) {
      console.log("pulling starter asset packs…");
      assetsPulled = runAssetsPull(targetDir);
      if (!assetsPulled) {
        console.error("warning: asset pull failed — the game runs, but models fall back to placeholders");
      }
    }

    if (!hasFlag(argv, "no-skills")) {
      const skillsStatus = installSkills("project", targetDir);
      if (skillsStatus !== 0) {
        console.error("warning: skill install failed — agent can still use AGENTS.md; retry: npx jgengine skills -p");
      }
    }

    const cdHint = relative(process.cwd(), targetDir) || ".";
    console.log("\nnext steps:");
    console.log(`  cd ${cdHint}`);
    if (!installed) console.log("  bun install   # or npm install");
    if (wantAssets && !assetsPulled) console.log(`  ${ASSETS_PULL_HINT}   # starter models into public/models`);
    console.log(dimension === "2d" ? "  bun dev       # board game with HUD controls" : "  bun dev       # walkable base: WASD + jump, HUD canvas");
    if (editor) {
      console.log("  # F2+E in the browser opens the scene editor on src/editor.scene.json (Ctrl+S saves)");
    }
    console.log(`  # agent: make ${displayName} with jgengine  (skills already in the project)`);
    return 0;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
