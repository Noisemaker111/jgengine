import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { cliVersion, findWorkspaceRoot, isEngineMonorepo, readPackageJson, sdkVersion } from "./pkg";
import { PROJECT_CONFIG_FILE, type ProjectConfig, readProjectConfig } from "./projectConfig";
import { compareSemver, loadReleaseNotes, lowestSdkVersion, releasesBetween, renderReleaseNotes } from "./releaseNotes";
import { gameTemplate, type TemplateVariant } from "./templates";
import { applyCatalogSync, planCatalogSync, readWorkspaceCatalog } from "./workspaceCatalog";

/**
 * The files a template shares with every game made from it: wiring, page, tooling scripts and the
 * agent guide. Sync rewrites them from the running engine; everything else in a game is its own.
 */
export const TEMPLATE_SHARED_FILES = [
  ".gitignore",
  "AGENTS.md",
  "index.html",
  "src/index.css",
  "src/index.tsx",
  "src/main.tsx",
  "tsconfig.json",
  "vite.config.ts",
] as const;

/** Files templates used to ship and no longer do; sync removes them from a template game. */
export const RETIRED_TEMPLATE_FILES = ["scripts/browser.mjs", "scripts/drive.mjs", "scripts/shoot.mjs"] as const;

/** package.json scripts a template owns: they run the jgengine CLI, so they stay in step with it. */
export const TEMPLATE_SCRIPTS = ["drive", "shoot"] as const;

/** One file sync would write, with its new contents; null contents delete it. */
export interface SyncWrite {
  path: string;
  contents: string | null;
}

/** Where a game sits: inside the engine monorepo's `games/`, or its own project on the npm packages. */
export interface SyncContext {
  variant: TemplateVariant;
  engineVersion: string;
  cliVersion: string;
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
export function syncManifest(
  manifest: Manifest,
  config: ProjectConfig,
  context: SyncContext,
  templateScripts: Record<string, string> = {},
): Manifest {
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
  if (Object.keys(templateScripts).length > 0) {
    next["scripts"] = { ...(manifest["scripts"] as Record<string, string> | undefined), ...templateScripts };
  }
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

  const templateScripts: Record<string, string> = {};
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
    for (const path of RETIRED_TEMPLATE_FILES) {
      if (!owned.has(path) && existsSync(join(dir, path))) writes.push({ path, contents: null });
    }
    const templateManifest = JSON.parse(files.find((file) => file.path === "package.json")!.contents) as { scripts?: Record<string, string> };
    for (const name of TEMPLATE_SCRIPTS) {
      const script = templateManifest.scripts?.[name];
      if (script !== undefined) templateScripts[name] = script;
    }
  }

  const manifestText = read("package.json");
  if (manifestText === null) throw new Error(`no package.json in ${dir}`);
  const manifest = JSON.parse(manifestText) as Manifest;
  const nextManifest = syncManifest(manifest, config, context, templateScripts);
  if (JSON.stringify(nextManifest) !== JSON.stringify(manifest)) {
    writes.push({ path: "package.json", contents: `${JSON.stringify(nextManifest, null, 2)}\n` });
  }

  return writes;
}

/** Apply a plan from {@link planSync}. */
export function applySync(dir: string, writes: SyncWrite[]): void {
  for (const write of writes) {
    const dest = join(dir, write.path);
    if (write.contents === null) {
      rmSync(dest, { force: true });
      const parent = dirname(dest);
      if (parent !== dir && existsSync(parent) && readdirSync(parent).length === 0) rmSync(parent, { recursive: true });
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, write.contents);
  }
}

/** The context sync runs a game in: the monorepo variant when it sits in the engine's `games/`. */
export function syncContext(dir: string): SyncContext {
  const workspaceRoot = findWorkspaceRoot(dir);
  const inRepo =
    workspaceRoot !== null &&
    isEngineMonorepo(workspaceRoot) &&
    resolve(dirname(dir)) === resolve(join(workspaceRoot, "games"));
  const base = { engineVersion: sdkVersion(), cliVersion: cliVersion() };
  if (!inRepo || workspaceRoot === null) return { ...base, variant: "standalone" };
  return { ...base, variant: "in-repo" };
}

const SYNC_USAGE = `usage: jgengine sync [dir...] [--check]

  Brings games up to this jgengine's engine version and makes each match its jgengine.json: the
  @jgengine packages in package.json, its template's shared files and scripts (wiring, page,
  AGENTS.md, shoot/drive). Run at a workspace
  root it also moves the @jgengine pins in the root's Bun catalogs, then syncs every workspace game.
  When versions move it prints the release notes in between: Migrate steps first, oldest release
  first. Run a newer CLI (npx jgengine@latest sync) to move to a newer engine.
  With no dir: the game or workspace root here.
  --check   change nothing; exit 1 and list what is out of date`;

function isWorkspaceRoot(dir: string): boolean {
  const workspaces = readPackageJson(join(dir, "package.json"))?.workspaces;
  return Array.isArray(workspaces) || Array.isArray(workspaces?.packages);
}

/** Workspace members of `root` that are games (have a `jgengine.json`), from `dir` and `dir/*` patterns. */
export function workspaceGames(root: string): string[] {
  const workspaces = readPackageJson(join(root, "package.json"))?.workspaces;
  const patterns: string[] = Array.isArray(workspaces) ? workspaces : Array.isArray(workspaces?.packages) ? workspaces.packages : [];
  const dirs = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = join(root, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.add(join(parent, entry.name));
      }
    } else if (!pattern.includes("*")) dirs.add(join(root, pattern));
  }
  return [...dirs].filter((dir) => existsSync(join(dir, PROJECT_CONFIG_FILE))).sort();
}

function syncTargets(argv: string[]): { roots: string[]; games: string[] } {
  const named = argv.filter((arg) => !arg.startsWith("-")).map((arg) => resolve(arg));
  const roots: string[] = [];
  const games: string[] = [];
  for (const dir of named.length > 0 ? named : [process.cwd()]) {
    if (!existsSync(join(dir, PROJECT_CONFIG_FILE)) && isWorkspaceRoot(dir)) {
      roots.push(dir);
      games.push(...workspaceGames(dir));
    } else games.push(dir);
  }
  return { roots, games };
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
  const target = sdkVersion();
  const { roots, games } = syncTargets(argv);
  const baselines: string[] = [];
  let stale = 0;
  let failed = 0;
  for (const root of roots) {
    const label = relative(process.cwd(), root) || "workspace root";
    try {
      const catalog = readWorkspaceCatalog(root);
      if (catalog === null) continue;
      const plan = planCatalogSync(catalog, target);
      for (const entry of plan.preserved) console.log(`sync ${label}: held ${entry.name} ${entry.range} (${entry.reason})`);
      if (plan.changes.length === 0) {
        console.log(`sync ${label}: catalogs up to date`);
        continue;
      }
      stale += 1;
      baselines.push(...plan.changes.map((change) => change.from));
      if (!check) applyCatalogSync(plan);
      const moved = plan.changes.map((change) => `${change.catalogSource}.${change.name} ${change.from} → ${change.to}`).join(", ");
      console.log(`sync ${label}: ${check ? "out of date" : "updated"} ${moved}`);
    } catch (error) {
      failed += 1;
      console.error(`sync ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const dir of games) {
    const label = relative(process.cwd(), dir) || basename(dir);
    try {
      const context = syncContext(dir);
      const writes = planSync(dir, context);
      if (writes.length === 0) {
        console.log(`sync ${label}: up to date`);
        continue;
      }
      stale += 1;
      if (context.variant === "standalone") {
        const manifest = readPackageJson(join(dir, "package.json"));
        const specs = Object.entries({ ...manifest?.dependencies, ...manifest?.devDependencies })
          .filter(([name]) => name.startsWith("@jgengine/"))
          .map(([, spec]) => String(spec));
        const baseline = lowestSdkVersion(specs);
        if (baseline !== null) baselines.push(baseline);
      }
      if (!check) applySync(dir, writes);
      console.log(`sync ${label}: ${check ? "out of date" : "updated"} ${writes.map((write) => write.path).join(", ")}`);
    } catch (error) {
      failed += 1;
      console.error(`sync ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const from = lowestSdkVersion(baselines);
  if (from !== null && compareSemver(from, target) < 0) {
    const notes = await loadReleaseNotes(roots[0] ?? games[0] ?? process.cwd());
    console.log(`\n${renderReleaseNotes(from, target, releasesBetween(notes.releases, from, target), notes.source)}`);
  }
  if (check && stale > 0) console.error(`\n${stale} out of date; run jgengine sync`);
  return failed > 0 || (check && stale > 0) ? 1 : 0;
}
