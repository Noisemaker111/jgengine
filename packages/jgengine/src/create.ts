import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { findWorkspaceRoot, flag, hasFlag, isEngineMonorepo, pickPackageManager, sdkVersion } from "./pkg";
import { installSkills } from "./skills";
import { type EditorSceneDoc, gameTemplate, parseCreateName, type TemplateVariant } from "./templates";

/** @internal */
export function writeGame(
  targetDir: string,
  id: string,
  name: string,
  variant: TemplateVariant,
  scene?: EditorSceneDoc,
): void {
  for (const file of gameTemplate({ id, name, variant, engineVersion: sdkVersion(), scene })) {
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

/** @internal */
export function registerRootGameScript(rootDir: string, id: string, folderName: string = id): boolean {
  const rootPackagePath = join(rootDir, "package.json");
  const root = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = root.scripts ?? {};
  const key = `games:${id}`;
  if (scripts[key] !== undefined) return false;
  const entries = Object.entries(scripts);
  const games = entries.filter(([k]) => k.startsWith("games:"));
  const rest = entries.filter(([k]) => !k.startsWith("games:"));
  games.push([key, `bun run --cwd Games/${folderName} dev`]);
  games.sort(([a], [b]) => a.localeCompare(b));
  root.scripts = Object.fromEntries([...rest, ...games]);
  writeFileSync(rootPackagePath, `${JSON.stringify(root, null, 2)}\n`);
  return true;
}

const VALUE_FLAGS = new Set(["--pm", "--from-scene"]);

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

/** @internal */
export function runCreate(argv: string[]): number {
  const nameArg = positionalArg(argv);
  if (nameArg === undefined) {
    console.error(
      'usage: jgengine create "<Game Name>" [--from-scene <folder>] [--in-repo|--standalone] [--no-install] [--no-skills] [--pm bun|npm|pnpm]',
    );
    return 1;
  }

  let displayName: string;
  let folderName: string;
  let id: string;
  try {
    const sceneArg = flag(argv, "from-scene");
    const scene = sceneArg !== undefined ? readPromotedScene(sceneArg) : undefined;

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
          "error: --in-repo requires the jgengine engine monorepo (packages/core + Games/)",
        );
        return 1;
      }
      if (parentHint === null) {
        parentDir = join(workspaceRoot, "Games");
        targetDir = join(parentDir, folderName);
      }
      const gamesDir = join(workspaceRoot, "Games");
      if (!isInsideDir(targetDir, gamesDir)) {
        console.error(
          `error: in-repo games must live under Games/ (got ${targetDir}; expected under ${gamesDir})`,
        );
        return 1;
      }
    }

    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      console.error(`error: ${targetDir} already exists and is not empty`);
      return 1;
    }

    writeGame(targetDir, id, displayName, variant, scene);
    console.log(`created ${displayName} (${variant}) → ${targetDir}`);
    console.log(`  folder ${folderName}  package ${id}  name "${displayName}"`);
    if (scene !== undefined) {
      console.log(`  promoted authored scene from ${resolve(sceneArg!)} → src/editor.scene.json`);
    }

    if (variant === "in-repo" && workspaceRoot !== null) {
      if (registerRootGameScript(workspaceRoot, id, folderName)) {
        console.log(`registered root script "games:${id}" in ${join(workspaceRoot, "package.json")}`);
      }
      console.log("\nnext steps:");
      console.log(`  bun install                     # from ${workspaceRoot}`);
      console.log(`  bun run games:${id}             # play it standalone`);
      console.log(`  # agent: open the project and build ${displayName} (skills live in the monorepo)`);
      return 0;
    }

    let installed = false;
    if (!hasFlag(argv, "no-install")) {
      const pm = pickPackageManager(flag(argv, "pm"));
      console.log(`installing dependencies with ${pm}…`);
      const install = spawnSync(pm, ["install"], {
        cwd: targetDir,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      installed = install.status === 0;
      if (!installed) console.error(`warning: ${pm} install failed — run it manually in ${targetDir}`);
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
    console.log("  bun dev       # walkable base: grass world, authored scene, WASD + jump, HUD canvas");
    console.log("  # F2+E in the browser opens the scene editor on src/editor.scene.json (Ctrl+S saves)");
    console.log(`  # agent: make ${displayName} with jgengine  (skills already in the project)`);
    return 0;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
