import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { candidatePaths } from "./check-path-portability";
import { coveredByGitHubRule, scanForGitHubAccess } from "./githubAccess";

const SCRATCH = join(import.meta.dir, "..", ".scratch");
const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The `file:line` of each finding in a tree made of `files`. */
function scan(files: Record<string, string>): string[] {
  const root = join(SCRATCH, `github-access-${crypto.randomUUID()}`);
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return scanForGitHubAccess(root, Object.keys(files)).map((line) => line.split(" ")[0] ?? "");
}

describe("tooling reaches GitHub only through gh", () => {
  test("an API URL, an SDK and a token read in tooling are each named, with the line", () => {
    expect(
      scan({
        "scripts/ship.ts": "const page = await get(`https://api.github.com/repos/${repo}/pulls`);\n",
        "scripts/upload.ts": "\nawait put(`https://uploads.github.com/repos/${repo}/releases/1/assets`);\n",
        "games/scripts/sync.ts": 'import { Octokit } from "@octokit/rest";\n',
        "apps/web/src/stats.tsx": 'const token = process.env["GITHUB_TOKEN"];\n',
        "packages/core/src/net/stars.ts": "export const STARS = \"https://api.github.com/repos/o/r\";\n",
        ".github/workflows/notify.yml": "      - run: curl -H \"authorization: Bearer $T\" https://api.github.com/repos/o/r/issues\n",
      }),
    ).toEqual([
      ".github/workflows/notify.yml:1",
      "apps/web/src/stats.tsx:1",
      "games/scripts/sync.ts:1",
      "packages/core/src/net/stars.ts:1",
      "scripts/ship.ts:1",
      "scripts/upload.ts:2",
    ]);
  });

  test("a landing script that builds its own gh call is named, and one going through scripts/github.ts is not", () => {
    expect(
      scan({
        "scripts/land.ts": 'const listed = io.gh(["pr", "list", "--head", branch]);\n',
        "scripts/ci-status.ts": 'const view = run("gh", ["api", `repos/${repo}/pulls/1`]);\nconst listed = ghRun(io, [\n  "pr",\n  "list",\n]);\n',
        "scripts/land-queue.ts": "const listed = io.github.listPulls({ base, state: \"open\" });\n",
        "scripts/lane-close.ts": 'io.sh(["run", "preflight"], true);\nio.sh(["gh", "run", "rerun", id], false);\n',
        "scripts/release.ts": 'gh(["pr", "list"]);\n',
      }),
    ).toEqual(["scripts/ci-status.ts:1", "scripts/ci-status.ts:2", "scripts/land.ts:1", "scripts/lane-close.ts:2"]);
  });

  test("product features that serve users through GitHub, tests and build output are waived", () => {
    expect(
      scan({
        "packages/github/src/source.ts": "await fetch(`https://api.github.com/repos/${repo}`);\n",
        "packages/assets/src/rocketboxPull.ts": 'const ROCKETBOX_API = "https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents";\n',
        "apps/web/src/routes/api/github-proxy.ts": 'const token = process.env["GITHUB_TOKEN"] || undefined;\n',
        "scripts/pr-video.ts": 'import { uploadPoliciesAssets } from "user-attachments";\n',
        "scripts/land.test.ts": 'gh(["pr", "merge"]);\n',
        "apps/web/.output/server/index.ts": "fetch(`https://api.github.com/x`);\n",
      }),
    ).toEqual([]);
    expect(coveredByGitHubRule("apps/web/node_modules/octokit/index.ts")).toBe(false);
    expect(coveredByGitHubRule("README.md")).toBe(false);
  });

  test("a waiver covers only the routes it names", () => {
    expect(scan({ "scripts/pr-video.ts": "await fetch(`https://api.github.com/repos/${repo}`);\n" })).toEqual(["scripts/pr-video.ts:1"]);
  });

  test("this repository is clean today", () => {
    const root = join(import.meta.dir, "..");
    expect(scanForGitHubAccess(root, candidatePaths(root))).toEqual([]);
  });
});
