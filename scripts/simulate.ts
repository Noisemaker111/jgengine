import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import ts from "typescript";

import type { PlayScriptSpec } from "@jgengine/shell/play";
import { formatPlayTimelineEntry, runPlayScript } from "@jgengine/shell/play";
import type { PlayableGame } from "@jgengine/shell/registry";

/**
 * Play a game headlessly from a committed script instead of playing it in a browser.
 *
 *   bun run simulate <game> <script> [--seed <seed>] [--json]
 *
 * `<game>` is a directory under ./Games (the ephemeral Noisemaker111/JGengine-games clone), `<script>`
 * is a file inside it exporting a PlayScript (as `script`, `play`, or the default export). Prints the
 * tick timeline and every assertion, and exits 1 when one fails, naming it.
 *
 * The game's own imports (`@/components/...`) and this checkout's source packages both have to
 * resolve, so the first process writes a tsconfig merging the game's `paths` with the engine source
 * and re-runs itself under it: one command, the game's real module graph, the engine under test — no
 * published copy in the middle.
 */

const CHILD_FLAG = "JG_SIMULATE_CHILD";

interface Args {
  game: string;
  scriptPath: string;
  seed?: string;
  json: boolean;
}

function usage(message?: string): never {
  if (message !== undefined) console.error(`simulate: ${message}`);
  console.error("usage: bun run simulate <game> <script> [--seed <seed>] [--json]");
  console.error("  <game>   directory under ./Games, e.g. scrap-signal");
  console.error("  <script> play script file inside that game, e.g. scripts/scrap-hit.play.ts");
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let seed: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--json") json = true;
    else if (arg === "--seed") {
      seed = argv[index + 1];
      if (seed === undefined) usage("--seed needs a value");
      index += 1;
    } else if (arg.startsWith("--")) usage(`unknown flag ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) usage(positional.length === 0 ? "no game named" : "expected <game> <script>");
  return { game: positional[0]!, scriptPath: positional[1]!, ...(seed === undefined ? {} : { seed }), json };
}

const repoRoot = resolve(import.meta.dir, "..");
const gamesRoot = join(repoRoot, "Games");

function gameEntry(gameDir: string): string {
  const manifestPath = join(gameDir, "package.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: Record<string, string> };
    const entry = manifest.exports?.["."];
    if (typeof entry === "string") {
      const candidate = join(gameDir, entry);
      if (existsSync(candidate)) return candidate;
    }
  }
  for (const candidate of ["src/index.tsx", "src/index.ts", "index.ts"]) {
    const path = join(gameDir, candidate);
    if (existsSync(path)) return path;
  }
  return usage(`no game entry in ${gameDir} (expected package.json exports "." or src/index.tsx)`);
}

/** `@jgengine/<pkg>` and `@jgengine/<pkg>/<sub>` resolved to this checkout's TypeScript source. */
function enginePaths(): Record<string, string[]> {
  const packagesDir = join(repoRoot, "packages");
  const packages = ["assets", "convex", "core", "editor", "github", "navbake", "node", "rapier", "react", "shell", "sql", "ws"];
  const paths: Record<string, string[]> = {};
  for (const name of packages) {
    const src = join(packagesDir, name, "src");
    paths[`@jgengine/${name}`] = [join(src, "index.ts")];
    paths[`@jgengine/${name}/*`] = [join(src, "*")];
  }
  return paths;
}

/** The game's own tsconfig `paths`, resolved against its baseUrl so `@/...` keeps working under the override. */
function gamePaths(gameDir: string): { baseUrl: string; paths: Record<string, string[]> } {
  const configPath = join(gameDir, "tsconfig.json");
  if (!existsSync(configPath)) return { baseUrl: gameDir, paths: {} };
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error !== undefined || read.config === undefined) return { baseUrl: gameDir, paths: {} };
  const parsed = ts.parseJsonConfigFileContent(read.config as object, ts.sys, gameDir);
  const baseUrl = parsed.options.baseUrl ?? gameDir;
  const paths: Record<string, string[]> = {};
  for (const [pattern, targets] of Object.entries(parsed.options.paths ?? {})) {
    paths[pattern] = targets.map((target) => (isAbsolute(target) ? target : join(baseUrl, target)));
  }
  return { baseUrl, paths };
}

/** First process: build the merged tsconfig, re-run this script under it, and clean up. */
function relaunchWithMergedTsconfig(gameDir: string): never {
  const { baseUrl, paths } = gamePaths(gameDir);
  const dir = mkdtempSync(join(tmpdir(), "jg-simulate-"));
  const configPath = join(dir, "tsconfig.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          baseUrl,
          paths: { ...paths, ...enginePaths() },
        },
      },
      null,
      2,
    ),
  );
  const child = Bun.spawnSync({
    cmd: [process.execPath, "--tsconfig-override", configPath, import.meta.path, ...process.argv.slice(2)],
    env: { ...process.env, [CHILD_FLAG]: "1" },
    stdio: ["inherit", "inherit", "inherit"],
  });
  if (process.env.JG_SIMULATE_DEBUG === "1") console.error(`simulate: tsconfig ${configPath}\n${readFileSync(configPath, "utf8")}`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(child.exitCode ?? 1);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const gameDir = join(gamesRoot, args.game);
  if (!existsSync(gameDir)) {
    console.error(`simulate: no game "${args.game}" under ${relative(repoRoot, gamesRoot)}\\ — run bun run games:clone first`);
    process.exit(2);
  }
  if (process.env[CHILD_FLAG] !== "1") relaunchWithMergedTsconfig(gameDir);

  const scriptFile = isAbsolute(args.scriptPath) ? args.scriptPath : join(gameDir, args.scriptPath);
  if (!existsSync(scriptFile)) {
    console.error(`simulate: no script at ${scriptFile}`);
    process.exit(2);
  }

  const started = Date.now();
  const loaded = (await import(gameEntry(gameDir))) as { game?: PlayableGame };
  if (loaded.game === undefined) {
    console.error(`simulate: ${relative(repoRoot, gameDir)} does not export "game"`);
    process.exit(2);
  }
  const scriptModule = (await import(scriptFile)) as { default?: PlayScriptSpec; script?: PlayScriptSpec; play?: PlayScriptSpec };
  const spec = scriptModule.script ?? scriptModule.play ?? scriptModule.default;
  if (spec === undefined) {
    console.error(`simulate: ${relative(repoRoot, scriptFile)} must export a script (as default, "script" or "play")`);
    process.exit(2);
  }

  const run = runPlayScript(loaded.game, args.seed === undefined ? spec : { ...spec, seed: args.seed });
  const elapsed = Date.now() - started;

  if (args.json) {
    console.log(JSON.stringify({ game: args.game, script: relative(repoRoot, scriptFile), elapsedMs: elapsed, ...run }, null, 2));
  } else {
    console.log(`${args.game} — ${run.ticks} ticks @ ${run.dt.toFixed(4)}s, seed ${String(run.seed)}`);
    for (const entry of run.timeline) console.log(`  ${formatPlayTimelineEntry(entry)}`);
    for (const result of run.expectations) {
      console.log(`  ${result.pass ? "PASS" : "FAIL"} ${result.id} — ${result.subject}: ${String(result.initial)} → ${String(result.value)}`);
    }
    console.log(`  timeline ${run.digest} in ${elapsed}ms`);
  }

  if (!run.passed) {
    const failed = run.expectations.filter((result) => !result.pass).map((result) => result.id);
    console.error(`simulate: FAILED ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`simulate: ${run.expectations.length} expectations passed in ${elapsed}ms`);
}

await main();
