/**
 * Repo tooling reaches GitHub through gh only: its commands, else `gh api`. This scan names every
 * other route (a direct API URL, an SDK, a token read) and every landing script that composes its own
 * gh call instead of going through scripts/github.ts. `check path-portability`, which reads the whole
 * tree on every verify:fast and in CI, runs it over the files git lists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A way to reach GitHub other than gh, and why it is refused. */
const GITHUB_ROUTES: readonly { rule: string; pattern: RegExp; why: string }[] = [
  { rule: "rest-host", pattern: /https?:\/\/(?:api|uploads)\.github\.com/, why: "calls GitHub's API host directly; use `gh api` (scripts/github.ts)" },
  { rule: "sdk", pattern: /(?:from\s+|require\(\s*|import\(\s*)["'](?:@octokit\/[^"']+|octokit|user-attachments)["']/, why: "a GitHub SDK; use gh or `gh api`" },
  { rule: "token", pattern: /env(?:\.|\[\s*["'])(?:GITHUB_TOKEN|GH_TOKEN)\b/, why: "reads a GitHub token itself; gh holds the credentials" },
];

/** The landing scripts reach GitHub only through scripts/github.ts, never with a gh command of their own. */
const LANDING_SCRIPTS = [
  "scripts/lane-close.ts",
  "scripts/land.ts",
  "scripts/land-batch.ts",
  "scripts/ci-status.ts",
];
/** `["gh", "pr", ...]`, or gh's argv alone (`["pr", ...]`, `["api", ...]`); `["run", ...]` alone is bun's. */
const OWN_GH_CALL = /\[\s*["']gh["']\s*,\s*["'][\w-]+["']|\[\s*["'](?:pr|api|issue|label|repo)["']\s*,/g;

/**
 * Product features that serve their users through GitHub, exempt from the gh-only rule for tooling,
 * and the one tooling step gh cannot do. Each waiver names the routes it allows and why, and every
 * waiver is printed when the scan fails.
 */
const GITHUB_PRODUCT: readonly { prefix: string; rules: readonly string[]; why: string }[] = [
  { prefix: "packages/github/", rules: ["rest-host", "sdk", "token"], why: "the GitHub integration games ship to their players" },
  { prefix: "packages/assets/", rules: ["rest-host", "token"], why: "@jgengine/assets pulls public packs from GitHub for the people who install it" },
  { prefix: "apps/web/src/routes/api/github-", rules: ["rest-host", "token"], why: "jgengine.com's GitHub panels, served to its visitors" },
  {
    prefix: "scripts/pr-video.ts",
    rules: ["sdk"],
    why: "attachment uploads live on github.com's browser upload endpoint, which neither gh nor the REST API can reach (cli/cli#13256)",
  },
];

const SELF = "scripts/githubAccess.ts";
const BUILT = /(?:^|\/)(?:node_modules|dist|\.output)\//;

/** Tooling and shipped source the rule covers; tests are left out, since they plant these routes on purpose. */
export function coveredByGitHubRule(path: string): boolean {
  if (path === SELF || BUILT.test(path)) return false;
  if (path.startsWith(".github/")) return /\.(?:ya?ml|sh)$/.test(path);
  if (!/\.tsx?$/.test(path) || /\.(?:test|spec)\.tsx?$/.test(path)) return false;
  return /^(?:scripts|games\/scripts|apps)\//.test(path) || /^packages\/[^/]+\/src\//.test(path);
}

function githubWaiver(path: string, rule: string): boolean {
  return GITHUB_PRODUCT.some((waiver) => path.startsWith(waiver.prefix) && waiver.rules.includes(rule));
}

/** Every waiver in force, for the failure message. */
export function githubWaivers(): string[] {
  return GITHUB_PRODUCT.map((waiver) => `${waiver.prefix} [${waiver.rules.join(", ")}]: ${waiver.why}`);
}

/**
 * `file:line why` for every place tooling reaches GitHub without gh, sorted by file and line.
 * `paths` are `/`-separated and relative to `root`; only the ones the rule covers are read.
 */
export function scanForGitHubAccess(root: string, paths: readonly string[]): string[] {
  const offending: string[] = [];
  for (const path of [...paths].filter(coveredByGitHubRule).sort()) {
    let text: string;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    const found: { line: number; why: string }[] = [];
    text.split("\n").forEach((line, index) => {
      for (const route of GITHUB_ROUTES) {
        if (route.pattern.test(line) && !githubWaiver(path, route.rule)) found.push({ line: index + 1, why: route.why });
      }
    });
    if (LANDING_SCRIPTS.includes(path)) {
      // A gh argv often spans lines (`[\n  "pr",`), so the landing rule reads the whole file.
      for (const call of text.matchAll(OWN_GH_CALL)) {
        found.push({ line: text.slice(0, call.index).split("\n").length, why: "builds its own gh call; landing scripts go through scripts/github.ts" });
      }
    }
    found.sort((a, b) => a.line - b.line);
    for (const hit of found) offending.push(`${path}:${hit.line} ${hit.why}`);
  }
  return offending;
}
