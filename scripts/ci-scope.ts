// Which game checks a pull request's diff has to pay for. CI's `changes` job calls this
// and the `smoke` and `perf` verdicts read the answer, so a skip can never stand in for a
// pass. `scripts/ci-scope.test.ts` holds the map.
//
//   bun scripts/ci-scope.ts --base origin/beta
//   bun scripts/ci-scope.ts --files packages/react/src/gameMenu.tsx
import { spawnSync } from "node:child_process";

import { printHelpIfAsked, type Usage } from "./script-help";

export type GameScope = "full" | "smoke" | "none";

export interface Verdict {
  scope: GameScope;
  /** One line for the check summary: what ran, and what a skip skipped. */
  reason: string;
  /** Changed paths that decided it. */
  matched: string[];
}

/**
 * A path that runs in a game's frame: the engine packages the games load, the games
 * themselves, the scripts that boot them, and the release that publishes them.
 * A change here pays for smoke and the frame budgets.
 */
const FULL = [
  /^packages\/(core|shell|react|assets|navbake|rapier|jgengine)\//,
  /^Games\//,
  /^scripts\/(?:perf-|smoke|ensure-games|ensure-ready|games-ref|browser-lib)/,
  /^\.github\/workflows\//,
  // `bun run release` rewrites CHANGELOG.md, so its presence marks the release PR.
  /^CHANGELOG\.md$/,
];

/**
 * A rendered surface no game loads. The editor draws its own scene, so a change there
 * still boots every game (a broken shared engine shows up in the boot) but cannot move
 * a game's draw or triangle budget.
 */
const SMOKE = [/^packages\/editor\//];

/**
 * Paths that cannot execute inside a game: prose, skills, change notes, the web app,
 * server and CLI packages, the lane tooling, repo config, and any test file. Nothing
 * here is loaded by a game, so the game matrix is skipped and the rest of the gate
 * still runs.
 */
const INERT = [
  /^(?:README|AGENTS|CREDITS|LICENSE)/,
  /^(?:\.claude|changes|examples|docs|\.github\/(?:ISSUE|PULL)_TEMPLATE)\//,
  /^apps\//,
  // Scaffold templates are copied into a new game, never loaded by a reference game.
  /^packages\/jgengine\/src\/templates\//,
  /^scripts\/(?:drive|capture|shoot|shot-metrics|gameFeel)/,
  /^packages\/(?:convex|github|node|sql|ws)\//,
  /^(?:biome\.json|\.gitignore|\.npmrc|\.editorconfig)$/,
  /^(?:\.github|\.vscode|\.devcontainer)\//,
];

const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$|^(?:scripts|packages)\/.*\/(?:__snapshots__|fixtures)\//;

/** A test file changes no shipped behavior, so it never pays for a game boot. */
export function isTestPath(path: string): boolean {
  return TEST_FILE.test(path);
}

export function isInertPath(path: string): boolean {
  return isTestPath(path) || INERT.some((pattern) => pattern.test(path));
}

/**
 * The game checks this diff has to pay for. Unknown paths are not inert: a path this
 * map has never seen runs the full matrix, so a new package cannot slip past the gate.
 */
export function gameScope(paths: readonly string[]): Verdict {
  const changed = paths.map((path) => path.trim()).filter(Boolean);
  if (changed.length === 0) {
    return { scope: "none", reason: "no changed paths", matched: [] };
  }
  // A test file ships nothing a game boots, so it never pays for a game run - even when its
  // directory is one a game loads.
  const live = changed.filter((path) => !isTestPath(path));
  if (live.length === 0) {
    return { scope: "none", reason: `test files only: ${summary(changed)}`, matched: changed };
  }
  const full = live.filter((path) => FULL.some((pattern) => pattern.test(path)));
  if (full.length > 0) {
    return { scope: "full", reason: `frame work changed: ${summary(full)}`, matched: full };
  }
  const smoke = live.filter((path) => SMOKE.some((pattern) => pattern.test(path)));
  if (smoke.length > 0) {
    return { scope: "smoke", reason: `rendered surface no game loads: ${summary(smoke)}`, matched: smoke };
  }
  const unknown = live.filter((path) => !isInertPath(path));
  if (unknown.length > 0) {
    return { scope: "full", reason: `unmapped path, so the full matrix: ${summary(unknown)}`, matched: unknown };
  }
  return {
    scope: "none",
    reason: `no runtime change: ${summary(changed)}`,
    matched: changed,
  };
}

/** `a, b and 3 more`, so a check summary stays one line. */
function summary(paths: readonly string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

/** Every path that turns on at least one game check, for the local `verify:fast` map. */
export function scopePattern(): RegExp {
  const sources = [...FULL, ...SMOKE].map((pattern) => pattern.source);
  return new RegExp(`(?:${sources.join("|")})`);
}

const USAGE: Usage = {
  summary: "decide which game checks a diff has to pay for",
  usage: "bun scripts/ci-scope.ts [--base <ref> | --files <path...>] [--github-output]",
  flags: [
    { flag: "--base <ref>", detail: "diff `<ref>...HEAD` and scope the changed paths" },
    { flag: "--files <path...>", detail: "scope these paths instead of a diff" },
    { flag: "--github-output", detail: "append `games=` and `reason=` to $GITHUB_OUTPUT" },
  ],
  example: "bun scripts/ci-scope.ts --base origin/beta",
  exits: ["0  always: the verdict is printed, not an exit code"],
};

export function renderVerdict(verdict: Verdict): string {
  const runs = verdict.scope === "full" ? "smoke-game + perf-game" : verdict.scope === "smoke" ? "smoke-game" : "neither game job";
  return `games=${verdict.scope} runs ${runs}: ${verdict.reason}`;
}

function changedPaths(argv: readonly string[]): string[] {
  const base = argv.indexOf("--base");
  if (base >= 0) {
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
      const verdict = gameScope(changedPaths(process.argv.slice(2)));
      console.log(renderVerdict(verdict));
      const output = process.env.GITHUB_OUTPUT;
      if (process.argv.includes("--github-output") && output !== undefined) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(output, `games=${verdict.scope}\nreason=${verdict.reason.replace(/[\r\n]+/g, " ")}\n`);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  }
}
