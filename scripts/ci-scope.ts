// Which game checks and which test shards a pull request's diff has to pay for. CI's
// `changes` job calls this and the `smoke` and `perf` verdicts read the answer, so a skip
// can never stand in for a pass. `scripts/ci-scope.test.ts` holds the map.
//
//   bun scripts/ci-scope.ts --base origin/beta
//   bun scripts/ci-scope.ts --files packages/react/src/gameMenu.tsx
import { spawnSync } from "node:child_process";

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
  /^packages\/core\/src\/game\/system(Runtime|Schedule)\.ts/,
  /^packages\/shell\/src\/(render|postfx|scatter|world)\//,
  /^Games\//,
  /^scripts\/(?:perf-|smoke|ensure-games|ensure-ready|games-ref|browser-lib)/,
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
];

/**
 * Paths that cannot execute inside a game: prose, skills, change notes, the web app,
 * server and CLI packages, the lane tooling, repo config, and any test file.
 */
const INERT = [
  /^(?:README|AGENTS|CREDITS|LICENSE)/,
  /^(?:\.claude|changes|examples|docs|\.github\/(?:ISSUE|PULL)_TEMPLATE)\//,
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
export function gameScope(paths: readonly string[]): Verdict {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  if (changed.length === 0) return verdict("none", "no changed paths", [], paths);
  // A test file ships nothing a game boots, so it never pays for a game run - even when its
  // directory is one a game loads.
  const live = changed.filter((path) => !isTestPath(path));
  if (live.length === 0) return verdict("none", `test files only: ${summary(changed)}`, changed, paths);
  const full = live.filter((path) => FULL.some((pattern) => pattern.test(path)));
  if (full.length > 0) return verdict("full", `frame work changed: ${summary(full)}`, full, paths);
  const surface = live.filter((path) => SURFACE.some((pattern) => pattern.test(path)));
  if (surface.length > 0) return verdict("surface", `shared surface changed: ${summary(surface)}`, surface, paths);
  const unknown = live.filter((path) => !isInertPath(path));
  if (unknown.length > 0) return verdict("full", `unmapped path, so every game: ${summary(unknown)}`, unknown, paths);
  return verdict("none", `no runtime change: ${summary(changed)}`, changed, paths);
}

function verdict(scope: GameScope, reason: string, matched: readonly string[], paths: readonly string[]): Verdict {
  const games = scope === "full" ? [...FRAME_GAMES] : scope === "surface" ? [REPRESENTATIVE_GAME] : [REPRESENTATIVE_GAME];
  // A `none` verdict still names one game so the matrix expands; the job's `if` is what skips it.
  return { scope, tests: testsNeeded(paths), games, reason, matched: [...matched] };
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
    { flag: "--github-output", detail: "append `games`, `gameList`, `tests` and `reason` to $GITHUB_OUTPUT" },
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
  return `games=${verdict.scope} runs ${runs}, ${tests}: ${verdict.reason}`;
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
        ? { scope: "full" as const, tests: "all" as const, games: [...FRAME_GAMES], reason: "--all: a push runs the full gate", matched: [] }
        : gameScope(changedPaths(args));
      console.log(renderVerdict(verdict));
      const output = process.env.GITHUB_OUTPUT;
      if (process.argv.includes("--github-output") && output !== undefined) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(
          output,
          [
            `games=${verdict.scope}`,
            `gameList=${JSON.stringify(verdict.games)}`,
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

