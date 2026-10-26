import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cliVersion, findWorkspaceRoot, isEngineMonorepo, sdkVersion } from "./pkg";
import { type CapabilityAnswers, PROJECT_CONFIG_FILE, type ProjectConfig, readProjectConfig, renderProjectConfig } from "./projectConfig";
import { gameTemplate, type TemplateVariant } from "./templates";

/**
 * The files a template shares with every game made from it: wiring, page, tooling scripts and the
 * agent guide. Sync rewrites them from the running engine; everything else in a game is its own.
 */
export const TEMPLATE_SHARED_FILES = [
  ".gitignore",
  "AGENTS.md",
  "index.html",
  "scripts/browser.mjs",
  "scripts/drive.mjs",
  "scripts/shoot.mjs",
  "src/index.css",
  "src/index.tsx",
  "src/main.tsx",
  "tsconfig.json",
  "vite.config.ts",
] as const;

/** One file sync would write, with its new contents. */
export interface SyncWrite {
  path: string;
  contents: string;
}

/** Where a game sits: inside the engine monorepo's `games/`, or its own project on the npm packages. */
export interface SyncContext {
  variant: TemplateVariant;
  engineVersion: string;
  cliVersion: string;
  /** Engine monorepo only: the game's capability answers brought up to the current ledger. */
  capabilities?: (current: CapabilityAnswers | null) => CapabilityAnswers;
}

type Manifest = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function sortedRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function engineSpec(context: SyncContext, current: string | undefined): string {
  if (context.variant === "in-repo") return "workspace:*";
  // A game inside its own workspace pins versions there; sync leaves that pin to the workspace.
  if (current !== undefined && /^(catalog|workspace):/.test(current)) return current;
  return `^${context.engineVersion}`;
}

/** package.json with its `@jgengine/*` dependencies matching `engine` and the running engine version. */
export function syncManifest(manifest: Manifest, config: ProjectConfig, context: SyncContext): Manifest {
  const dependencies: Record<string, string> = {};
  let added = false;
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    if (!name.startsWith("@jgengine/")) dependencies[name] = spec;
    else if (config.engine.includes(name.slice("@jgengine/".length))) dependencies[name] = engineSpec(context, spec);
  }
  for (const name of config.engine) {
    const key = `@jgengine/${name}`;
    if (key in dependencies) continue;
    dependencies[key] = engineSpec(context, undefined);
    added = true;
  }
  const next: Manifest = { ...manifest, dependencies: added ? sortedRecord(dependencies) : dependencies };
  if (manifest.devDependencies !== undefined) {
    next.devDependencies = Object.fromEntries(
      Object.entries(manifest.devDependencies).map(([name, spec]) => {
        if (name.startsWith("@jgengine/")) return [name, engineSpec(context, spec)];
        if (name === "jgengine" && context.variant === "standalone") return [name, context.cliVersion];
        return [name, spec];
      }),
    );
  }
  return next;
}

function sameText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}

/** Every write that would make the game at `dir` match its `jgengine.json` and the running engine. */
export function planSync(dir: string, context: SyncContext): SyncWrite[] {
  const config = readProjectConfig(dir);
  if (config.editor === true && !config.engine.includes("editor")) {
    throw new Error(`${join(dir, PROJECT_CONFIG_FILE)}: "editor": true needs "editor" in "engine"`);
  }
  const writes: SyncWrite[] = [];
  const read = (path: string): string | null => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf8") : null);

  if (config.template !== undefined) {
    const owned = new Set(config.owns ?? []);
    const files = gameTemplate({
      id: config.id,
      name: config.name,
      variant: context.variant,
      engineVersion: context.engineVersion,
      cliVersion: context.cliVersion,
      dimension: config.template === "2d" ? "2d" : "3d",
      editor: config.template !== "2d" && (config.editor ?? true),
      ...(config.template === "builder" ? { shape: "shared-world-builder" as const } : {}),
    });
    for (const file of files) {
      if (!(TEMPLATE_SHARED_FILES as readonly string[]).includes(file.path) || owned.has(file.path)) continue;
      const current = read(file.path);
      if (current === null || !sameText(current, file.contents)) writes.push(file);
    }
  }

  const manifestText = read("package.json");
  if (manifestText === null) throw new Error(`no package.json in ${dir}`);
  const manifest = JSON.parse(manifestText) as Manifest;
  const nextManifest = syncManifest(manifest, config, context);
  if (JSON.stringify(nextManifest) !== JSON.stringify(manifest)) {
    writes.push({ path: "package.json", contents: `${JSON.stringify(nextManifest, null, 2)}\n` });
  }

  if (context.capabilities !== undefined) {
    const answers = context.capabilities(config.capabilities ?? null);
    if (JSON.stringify(answers) !== JSON.stringify(config.capabilities)) {
      writes.push({ path: PROJECT_CONFIG_FILE, contents: renderProjectConfig({ ...config, capabilities: answers }) });
    }
  }
  return writes;
}

/** Apply a plan from {@link planSync}. */
export function applySync(dir: string, writes: SyncWrite[]): void {
  for (const write of writes) {
    const dest = join(dir, write.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, write.contents);
  }
}

interface CapabilityModule {
  syncDeclaration: (root: string, game: string, ledger: unknown, current: CapabilityAnswers | null) => CapabilityAnswers;
}

/** Monorepo games answer the engine's capability ledger; the ledger tooling lives with the games. */
async function monorepoCapabilities(workspaceRoot: string, dir: string): Promise<SyncContext["capabilities"]> {
  const gamesRoot = join(workspaceRoot, "games");
  if (!existsSync(join(gamesRoot, "capabilities.json"))) return undefined;
  const module = (await import(pathToFileURL(join(gamesRoot, "scripts", "capabilities.ts")).href)) as CapabilityModule;
  const ledger = JSON.parse(readFileSync(join(gamesRoot, "capabilities.json"), "utf8")) as unknown;
  return (current) => module.syncDeclaration(gamesRoot, basename(dir), ledger, current);
}

/** The context sync runs a game in: the monorepo variant when it sits in the engine's `games/`. */
export async function syncContext(dir: string): Promise<SyncContext> {
  const workspaceRoot = findWorkspaceRoot(dir);
  const inRepo =
    workspaceRoot !== null &&
    isEngineMonorepo(workspaceRoot) &&
    resolve(dirname(dir)) === resolve(join(workspaceRoot, "games"));
  const base = { engineVersion: sdkVersion(), cliVersion: cliVersion() };
  if (!inRepo || workspaceRoot === null) return { ...base, variant: "standalone" };
  return { ...base, variant: "in-repo", capabilities: await monorepoCapabilities(workspaceRoot, dir) };
}

const SYNC_USAGE = `usage: jgengine sync [game-dir...] [--check]

  Makes each game match its jgengine.json and this engine version: the @jgengine packages in
  package.json, its template's shared files (wiring, page, tooling scripts, AGENTS.md) and, in the
  engine monorepo, its capability answers. With no dir: the game here, or every game in the
  monorepo's games/.
  --check   change nothing; exit 1 and list what is out of date`;

function gameDirsToSync(argv: string[]): string[] {
  const named = argv.filter((arg) => !arg.startsWith("-")).map((arg) => resolve(arg));
  if (named.length > 0) return named;
  const here = process.cwd();
  if (existsSync(join(here, PROJECT_CONFIG_FILE))) return [here];
  const workspaceRoot = findWorkspaceRoot(here);
  if (workspaceRoot !== null && isEngineMonorepo(workspaceRoot) && resolve(here) === resolve(workspaceRoot)) {
    const games = join(workspaceRoot, "games");
    return readdirSync(games, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(games, entry.name, PROJECT_CONFIG_FILE)))
      .map((entry) => join(games, entry.name))
      .sort();
  }
  return [here];
}

/** @internal */
export async function runSync(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(SYNC_USAGE);
    return 0;
  }
  const unknown = argv.find((arg) => arg.startsWith("-") && arg !== "--check");
  if (unknown !== undefined) {
    console.error(`error: unknown flag ${unknown}\n\n${SYNC_USAGE}`);
    return 1;
  }
  const check = argv.includes("--check");
  let stale = 0;
  let failed = 0;
  for (const dir of gameDirsToSync(argv)) {
    const label = relative(process.cwd(), dir) || basename(dir);
    try {
      const writes = planSync(dir, await syncContext(dir));
      if (writes.length === 0) {
        console.log(`sync ${label}: up to date`);
        continue;
      }
      stale += 1;
      if (!check) applySync(dir, writes);
      console.log(`sync ${label}: ${check ? "out of date" : "updated"} ${writes.map((write) => write.path).join(", ")}`);
    } catch (error) {
      failed += 1;
      console.error(`sync ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (check && stale > 0) console.error(`\n${stale} game(s) out of date; run jgengine sync`);
  return failed > 0 || (check && stale > 0) ? 1 : 0;
}
