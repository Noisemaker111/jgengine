import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { cliVersion, findWorkspaceRoot, flag, hasFlag, isEngineMonorepo } from "./pkg";
import { gameTemplate, parseCreateName, type TemplateVariant } from "./templates";

export function writeGame(targetDir: string, id: string, name: string, variant: TemplateVariant): void {
  for (const file of gameTemplate({ id, name, variant, engineVersion: cliVersion() })) {
    const dest = join(targetDir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }
}

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

function pickPackageManager(preferred: string | undefined): string {
  if (preferred !== undefined) return preferred;
  const probe = spawnSync("bun", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
  return probe.status === 0 ? "bun" : "npm";
}

const VALUE_FLAGS = new Set(["--pm"]);

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

export function runCreate(argv: string[]): number {
  const nameArg = positionalArg(argv);
  if (nameArg === undefined) {
    console.error(
      'usage: jgengine create "<Game Name>" [--in-repo|--standalone] [--no-install] [--pm bun|npm|pnpm]',
    );
    return 1;
  }

  let displayName: string;
  let folderName: string;
  let id: string;
  try {
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

    writeGame(targetDir, id, displayName, variant);
    console.log(`created ${displayName} (${variant}) → ${targetDir}`);
    console.log(`  folder ${folderName}  package ${id}  name "${displayName}"`);

    if (variant === "in-repo" && workspaceRoot !== null) {
      if (registerRootGameScript(workspaceRoot, id, folderName)) {
        console.log(`registered root script "games:${id}" in ${join(workspaceRoot, "package.json")}`);
      }
      console.log("\nnext steps:");
      console.log(`  bun install                     # from ${workspaceRoot}`);
      console.log(`  bun run games:${id}             # play it standalone`);
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

    const cdHint = relative(process.cwd(), targetDir) || ".";
    console.log("\nnext steps:");
    console.log(`  cd ${cdHint}`);
    if (!installed) console.log("  bun install   # or npm install");
    console.log("  bun dev       # or npm run dev — flat world, spawned player, working HUD");
    console.log("  npx jgengine skills   # install the JGengine agent skills for AI-assisted building");
    return 0;
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
