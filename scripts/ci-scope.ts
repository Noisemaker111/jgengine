// Which game checks and which test shards a pull request's diff has to pay for. CI's
// `changes` job calls this and the `smoke`, `perf` and `games` verdicts read the answer, so
// a skip can never stand in for a pass. `scripts/ci-scope.test.ts` holds the map.
//
//   bun scripts/ci-scope.ts --base origin/beta
//   bun scripts/ci-scope.ts --files packages/core/src/menu/gameMenu.view.tsx
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { printHelpIfAsked, type Usage } from "./script-help";

export type GameScope = "full" | "surface" | "none";

/**
 * Every reference game the frame gate measures. `scripts/heavy-paths.test.ts` holds this
 * equal to `PERF_GATE_GAMES`, which this file cannot import: the `changes` job runs it with
 * no node_modules, so it depends on nothing.
 */
export const FRAME_GAMES = [
  "harbor-heat",
  "scrap-signal",
  "brightway-park",
  "ember-command",
  "beacon-bastion",
  "drift-foundry",
  "odd-orbit",
  "deepward",
] as const;

/**
 * The one game a shared-surface change boots. It imports every engine package the reference
 * games use and held all three red frame-budget legs in the last night's CI, so a shared
 * regression trips here first.
 */
export const REPRESENTATIVE_GAME = "harbor-heat";

export interface Verdict {
  /** `full` measures every game, `surface` boots the representative one, `none` runs neither. */
  scope: GameScope;
  /** `none` skips the test shards: the diff is change notes, which no test reads. */
  tests: "all" | "none";
  /** The game matrix the `perf-game` job runs; never empty, so the matrix always expands. */
  games: readonly string[];
  /** The games under `games/` whose type-check and tests the `games` job runs; empty skips it. */
  gameChecks: readonly string[];
  /** One line for the check summary: what ran, and what a skip skipped. */
  reason: string;
  /** Changed paths that decided it. */
  matched: string[];
}

/**
 * A path that runs in a game's frame: the systems the tick loop calls, the movement queries
 * that read them, the object and obstacle index they scan, the stepper and its clock, the
 * scheduler, the shell's render passes, the games themselves, the scripts that boot them,
 * and the release that publishes them. A change here pays for every game.
 */
const FULL = [
  /^packages\/core\/src\/(render|scene|sim|ai|nav|physics|movement|runtime|time)\//,
  // Frame work moved home from shell/render, postfx, scatter and world.
  /^packages\/core\/src\/(model|lighting|material|postfx|scatter|instancing|terrain|lod|visibility|environment|camera)\//,
  /^packages\/core\/src\/game\/system(Runtime|Schedule)\.ts/,
  /^packages\/shell\/src\/(render|postfx|scatter|world)\//,
  // Every game boots through the shared Vite engine-source resolution.
  /^games\/shared\//,
  /^scripts\/(?:perf-|smoke|ensure-ready|browser-lib)/,
  /^\.github\/workflows\//,
  // `bun run release` rewrites CHANGELOG.md, so its presence marks the release PR.
  /^CHANGELOG\.md$/,
];

/**
 * A rendered or consumed surface outside the frame's own work. It can break a boot and move
 * what a game draws, so one representative game boots it; it is not the code a frame runs
 * through, so the other seven games would pay for the same answer.
 */
const SURFACE = [
  /^packages\/(core|shell|react|editor|assets|navbake|rapier|jgengine)\//,
  // A dependency or compiler-setting change reaches every package a game loads.
  /^(?:package\.json|bun\.lock|tsconfig[^/]*\.json)$/,
  // The dev runner mounts a game: it can break a boot without touching a package.
  /^apps\/dev\//,
  /^games\/tsconfig[^/]*\.json$/,
];

/** `games/<id>/...`: a change inside one game reaches that game and no other. */
const GAME_PATH = /^games\/([^/]+)\//;

/** The folders under `games/` that hold no game. */
const NON_GAME_DIRS = new Set(["shared", "scripts", "docs", "registry", "node_modules"]);

/**
 * Paths that cannot execute inside a game: prose, skills, change notes, the web app,
 * server and CLI packages, the lane tooling, repo config, and any test file.
 */
const INERT = [
  /^(?:README|AGENTS|CREDITS|LICENSE)/,
  /^(?:\.claude|changes|examples|docs|\.github\/(?:ISSUE|PULL)_TEMPLATE)\//,
  // The games' own gates, docs, registry and ledger; the `games` job runs them, no game frame does.
  /^games\/(?:scripts|docs|registry)\//,
  /^games\/[^/]+\.(?:md|json)$/,
  /^games\/\.gitignore$/,
  /^apps\//,
  // Scaffold templates are copied into a new game, never loaded by a reference game.
  /^packages\/jgengine\/src\/templates\//,
  /^packages\/(?:convex|github|node|sql|ws)\//,
  // Lane tooling: a script the gates above do not run changes no shipped behavior.
  /^scripts\//,
  /^(?:biome\.json|\.gitignore|\.npmrc|\.editorconfig)$/,
  /^(?:\.github|\.vscode|\.devcontainer)\//,
];

/** Change notes and examples: the only prose no test parses. */
const PROSE_ONLY = [/^changes\//, /^examples\//];

const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$|^(?:scripts|packages)\/.*\/(?:__snapshots__|fixtures)\//;

export function isTestPath(path: string): boolean {
  return TEST_FILE.test(path);
}

export function isInertPath(path: string): boolean {
  return isTestPath(path) || INERT.some((pattern) => pattern.test(path));
}

/**
 * The test shards run unless the whole diff is change notes. Skills, README and AGENTS are
 * read by tests (`check-recipes`, `check-recursive-walk`, `changelog-fragments`), so they
 * keep the shards.
 */
export function testsNeeded(paths: readonly string[]): "all" | "none" {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  return changed.length > 0 && changed.every((path) => PROSE_ONLY.some((pattern) => pattern.test(path))) ? "none" : "all";
}

/**
 * The game run this diff has to pay for. Unknown paths are not inert: a path this map has
 * never seen measures every game, so a new package cannot slip past the gate.
 */
export function gameScope(paths: readonly string[], workspace: GameWorkspace = readGameWorkspace()): Verdict {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  const checks = gameChecks(changed, workspace);
  if (changed.length === 0) return verdict("none", "no changed paths", [], paths, checks);
  // A test file ships nothing a game boots, so it never pays for a game run - even when its
  // directory is one a game loads.
  const live = changed.filter((path) => !isTestPath(path));
  if (live.length === 0) return verdict("none", `test files only: ${summary(changed)}`, changed, paths, checks);
  const full = live.filter((path) => FULL.some((pattern) => pattern.test(path)));
  if (full.length > 0) return verdict("full", `frame work changed: ${summary(full)}`, full, paths, checks);
  // A change inside one reference game measures that game; a game outside the frame set has
  // no budget, and the `games` job still checks it.
  const inGame = live.filter((path) => gameOf(path) !== null);
  const framed = [...new Set(inGame.map(gameOf))].filter((id): id is string => (FRAME_GAMES as readonly string[]).includes(id ?? ""));
  const surface = live.filter((path) => SURFACE.some((pattern) => pattern.test(path)));
  if (surface.length > 0 || framed.length > 0) {
    const games = surface.length > 0 ? [...new Set([REPRESENTATIVE_GAME, ...framed])] : framed;
    const why = surface.length > 0 ? `shared surface changed: ${summary(surface)}` : `game changed: ${framed.join(", ")}`;
    return verdict("surface", why, [...surface, ...inGame], paths, checks, games);
  }
  const unknown = live.filter((path) => !isInertPath(path) && gameOf(path) === null);
  if (unknown.length > 0) return verdict("full", `unmapped path, so every game: ${summary(unknown)}`, unknown, paths, checks);
  return verdict("none", `no runtime change: ${summary(changed)}`, changed, paths, checks);
}

function verdict(
  scope: GameScope,
  reason: string,
  matched: readonly string[],
  paths: readonly string[],
  gameChecks: readonly string[],
  games: readonly string[] = scope === "full" ? [...FRAME_GAMES] : [REPRESENTATIVE_GAME],
): Verdict {
  // A `none` verdict still names one game so the matrix expands; the job's `if` is what skips it.
  return { scope, tests: testsNeeded(paths), games, gameChecks, reason, matched: [...matched] };
}

/** The game a path sits in, or `null` outside `games/<id>/`. */
function gameOf(path: string): string | null {
  const id = GAME_PATH.exec(path)?.[1];
  return id === undefined || NON_GAME_DIRS.has(id) || id.startsWith(".") ? null : id;
}

/** Every game under `games/` and the engine packages it declares. */
export interface GameWorkspace {
  games: readonly { id: string; engine: readonly string[] }[];
}

export function readGameWorkspace(root: string = process.cwd()): GameWorkspace {
  const dir = join(root, "games");
  if (!existsSync(dir)) return { games: [] };
  const games: { id: string; engine: string[] }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || NON_GAME_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const manifest = join(dir, entry.name, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const engine = Object.keys({ ...pkg.devDependencies, ...pkg.dependencies })
      .filter((name) => name.startsWith("@jgengine/"))
      .map((name) => name.slice("@jgengine/".length));
    games.push({ id: entry.name, engine });
  }
  return { games: games.sort((a, b) => a.id.localeCompare(b.id)) };
}

/**
 * Paths that reach every game's type-check and tests: what every game resolves (the root
 * install, compiler settings, the shared Vite resolution) and the games' own gates.
 */
const EVERY_GAME = [
  /^(?:package\.json|bun\.lock|tsconfig[^/]*\.json)$/,
  /^games\/(?:shared|scripts|registry)\//,
  /^games\/(?:package\.json|tsconfig[^/]*\.json|capabilities\.json)$/,
  /^\.github\/workflows\/ci\.yml$/,
];

/**
 * The games the `games` job type-checks and tests: each game a changed file sits in, each game
 * that declares a changed engine package, and every game for a change they all resolve.
 */
export function gameChecks(paths: readonly string[], workspace: GameWorkspace): string[] {
  const all = workspace.games.map((game) => game.id).sort();
  if (paths.some((path) => EVERY_GAME.some((pattern) => pattern.test(path)))) return all;
  const reached = new Set<string>();
  for (const path of paths) {
    const id = gameOf(path);
    if (id !== null && all.includes(id)) reached.add(id);
    const pkg = /^packages\/([^/]+)\//.exec(path)?.[1];
    if (pkg === undefined || isTestPath(path)) continue;
    for (const game of workspace.games) if (game.engine.includes(pkg)) reached.add(game.id);
  }
  return all.filter((id) => reached.has(id));
}

/** `a, b and 3 more`, so a check summary stays one line. */
function summary(paths: readonly string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

/** Every path that turns on a game run, for the local `verify:fast` map. */
export function scopePattern(): RegExp {
  return new RegExp(`(?:${[...FULL, ...SURFACE].map((pattern) => pattern.source).join("|")})`);
}

const USAGE: Usage = {
  summary: "decide which game checks and test shards a diff has to pay for",
  usage: "bun scripts/ci-scope.ts [--base <ref> | --files <path...> | --all] [--github-output]",
  flags: [
    { flag: "--base <ref>", detail: "diff `<ref>...HEAD` and scope the changed paths" },
    { flag: "--files <path...>", detail: "scope these paths instead of a diff" },
    { flag: "--all", detail: "every game and every test shard: a push runs the full gate" },
    { flag: "--github-output", detail: "append `games`, `gameList`, `gameChecks`, `tests` and `reason` to $GITHUB_OUTPUT" },
  ],
  example: "bun scripts/ci-scope.ts --base origin/beta",
  exits: ["0  always: the verdict is printed, not an exit code"],
};

export function renderVerdict(verdict: Verdict): string {
  const runs =
    verdict.scope === "full"
      ? `perf-game on ${verdict.games.length} games`
      : verdict.scope === "surface"
        ? `perf-game on ${verdict.games.join(", ")}`
        : "no game job";
  const tests = verdict.tests === "all" ? "every test shard" : "no test shard";
  const checks = verdict.gameChecks.length === 0 ? "no game checks" : `game checks on ${verdict.gameChecks.length} game(s)`;
  return `games=${verdict.scope} runs ${runs}, ${tests}, ${checks}: ${verdict.reason}`;
}

function changedPaths(argv: readonly string[]): string[] {
  const base = argv.indexOf("--base");  if (base >= 0) {
    const ref = argv[base + 1];
    if (ref === undefined) throw new Error("ci-scope: --base needs a ref");
    const diff = spawnSync("git", ["diff", "--name-only", `${ref}...HEAD`], { encoding: "utf8", timeout: 60_000 });
    if (diff.status !== 0) throw new Error(`ci-scope: git diff against ${ref} failed: ${diff.stderr.trim()}`);
    return diff.stdout.split("\n");
  }
  const files = argv.indexOf("--files");
  if (files >= 0) return argv.slice(files + 1).filter((arg) => !arg.startsWith("--"));
  throw new Error("ci-scope: pass --base <ref> or --files <path...>");
}

if (import.meta.main) {
  if (!printHelpIfAsked("ci-scope", USAGE)) {
    try {
      const args = process.argv.slice(2);
      const verdict = args.includes("--all")
        ? {
            scope: "full" as const,
            tests: "all" as const,
            games: [...FRAME_GAMES],
            gameChecks: readGameWorkspace().games.map((game) => game.id),
            reason: "--all: a push runs the full gate",
            matched: [],
          }
        : gameScope(changedPaths(args));
      console.log(renderVerdict(verdict));
      const output = process.env["GITHUB_OUTPUT"];
      if (process.argv.includes("--github-output") && output !== undefined) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(
          output,
          [
            `games=${verdict.scope}`,
            `gameList=${JSON.stringify(verdict.games)}`,
            `gameChecks=${verdict.gameChecks.join(" ")}`,
            `tests=${verdict.tests}`,
            `reason=${verdict.reason.replace(/[\r\n]+/g, " ")}`,
            "",
          ].join("\n"),
        );
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  }
}

