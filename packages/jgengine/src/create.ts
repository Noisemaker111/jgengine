import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { cliVersion, findWorkspaceRoot, flag, hasFlag, isEngineMonorepo } from "./pkg";
import { displayNameFromId, GAME_ID_PATTERN, gameTemplate, type TemplateVariant } from "./templates";

export function writeGame(targetDir: string, id: string, name: string, variant: TemplateVariant): void {
  for (const file of gameTemplate({ id, name, variant, engineVersion: cliVersion() })) {
    const dest = join(targetDir, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }
}

export function registerRootGameScript(rootDir: string, id: string): boolean {
  const rootPackagePath = join(rootDir, "package.json");
  const root = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = root.scripts ?? {};
  const key = `games:${id}`;
  if (scripts[key] !== undefined) return false;
  const entries = Object.entries(scripts);
  const games = entries.filter(([k]) => k.startsWith("games:"));
  const rest = entries.filter(([k]) => !k.startsWith("games:"));
  games.push([key, `bun run --cwd Games/${id} dev`]);
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

const VALUE_FLAGS = new Set(["--name", "--pm"]);

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

export function runCreate(argv: string[]): number {
  const dirArg = positionalArg(argv);
  if (dirArg === undefined) {
    console.error("usage: jgengine create <dir> [--name <display name>] [--in-repo|--standalone] [--no-install] [--pm bun|npm|pnpm]");
    return 1;
  }
  const targetDir = resolve(dirArg);
  const id = basename(targetDir);
  if (!GAME_ID_PATTERN.test(id)) {
    console.error(`error: directory name "${id}" must be kebab-case (lowercase letters, digits, dashes, starting with a letter)`);
    return 1;
  }
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    console.error(`error: ${targetDir} already exists and is not empty`);
    return 1;
  }

  const workspaceRoot = findWorkspaceRoot(dirname(targetDir));
  const insideEngineRepo = workspaceRoot !== null && isEngineMonorepo(workspaceRoot);
  const variant: TemplateVariant = hasFlag(argv, "standalone")
    ? "standalone"
    : hasFlag(argv, "in-repo") || insideEngineRepo
      ? "in-repo"
      : "standalone";
  if (variant === "in-repo" && !insideEngineRepo) {
    console.error("error: --in-repo requires the target to live under Games/ inside the jgengine engine monorepo");
    return 1;
  }

  const name = flag(argv, "name") ?? displayNameFromId(id);
  writeGame(targetDir, id, name, variant);
  console.log(`created ${name} (${variant}) with ${gameTemplateFileCount()} files in ${targetDir}`);

  if (variant === "in-repo" && workspaceRoot !== null) {
    if (registerRootGameScript(workspaceRoot, id)) {
      console.log(`registered root script "games:${id}" in ${join(workspaceRoot, "package.json")}`);
    }
    console.log("\nnext steps:");
    console.log(`  bun install                     # from ${workspaceRoot}`);
    console.log(`  bun run games:${id}             # play it standalone`);
    console.log("  continue the numbered JGengine blueprint; scaffolding is not a stopping point");
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
  console.log("  npx jgengine skills   # install the intake router and focused API skills");
  console.log("  continue the numbered JGengine blueprint; scaffolding is not a stopping point");
  return 0;
}

function gameTemplateFileCount(): number {
  return gameTemplate({ id: "probe", name: "Probe", variant: "standalone", engineVersion: "0.0.0" }).length;
}
