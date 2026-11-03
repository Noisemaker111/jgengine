/**
 * Repo tooling reaches GitHub through gh only: its commands, else `gh api`. This scan names every
 * other route (a direct API URL, an SDK, a token read) and every landing script that composes its own
 * gh call instead of going through scripts/github.ts. `check capture-hygiene` runs it, so verify:fast
 * refuses a change that adds one.
 */
import { relative as relativeTo } from "node:path";

import { isTypeScript, runtimeSources } from "./check-scaffold-launch";

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
  "scripts/land-queue.ts",
  "scripts/ci-status.ts",
  "scripts/pr-sweep.ts",
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

/** The files that define the rule itself, so their patterns are not read as uses. */
const SELF = new Set(["scripts/githubAccess.ts", "scripts/check-scaffold-launch.ts"]);

function githubWaiver(relative: string, rule: string): boolean {
  return GITHUB_PRODUCT.some((waiver) => relative.startsWith(waiver.prefix) && waiver.rules.includes(rule));
}

/** Every waiver in force, for the failure message. */
export function githubWaivers(): string[] {
  return GITHUB_PRODUCT.map((waiver) => `${waiver.prefix} [${waiver.rules.join(", ")}]: ${waiver.why}`);
}

/**
 * `file:line why` for every place tooling reaches GitHub without gh, sorted by file and line: scripts,
 * package sources, games/scripts, apps and .github workflows; tests are skipped.
 */
export async function scanForGitHubAccess(cwd = process.cwd()): Promise<string[]> {
  const offending: { file: string; line: number; why: string }[] = [];
  const sources = runtimeSources(cwd, [
    { dir: "games/scripts", keep: isTypeScript },
    { dir: "apps", keep: (path) => isTypeScript(path) && !/[\\/](?:node_modules|dist|\.output)[\\/]/.test(path) },
    { dir: ".github", keep: (path) => /\.ya?ml$|\.sh$/.test(path) },
  ]);
  for (const path of sources) {
    const relative = relativeTo(cwd, path).replaceAll("\\", "/");
    if (SELF.has(relative)) continue;
    const text = await Bun.file(path).text();
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const route of GITHUB_ROUTES) {
        if (route.pattern.test(line) && !githubWaiver(relative, route.rule)) offending.push({ file: relative, line: index + 1, why: route.why });
      }
    }
    if (!LANDING_SCRIPTS.includes(relative)) continue;
    // A gh argv often spans lines (`[\n  "pr",`), so the landing rule reads the whole file.
    for (const call of text.matchAll(OWN_GH_CALL)) {
      const line = text.slice(0, call.index).split("\n").length;
      offending.push({ file: relative, line, why: "builds its own gh call; landing scripts go through scripts/github.ts" });
    }
  }
  offending.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return offending.map((found) => `${found.file}:${found.line} ${found.why}`);
}
