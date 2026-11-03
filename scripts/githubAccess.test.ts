import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanForGitHubAccess } from "./githubAccess";

function tree(files: Record<string, string>): string {
  // fixture-location: allow the scan only reads file names and lines of text, so no engine import is needed
  const root = mkdtempSync(join(tmpdir(), "jg-github-scan-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

describe("tooling reaches GitHub only through gh", () => {
  test("an API URL, an SDK and a token read in tooling are each named, with the line", async () => {
    const root = tree({
      "scripts/ship.ts": "const page = await get(`https://api.github.com/repos/${repo}/pulls`);\n",
      "scripts/upload.ts": "\nawait put(`https://uploads.github.com/repos/${repo}/releases/1/assets`);\n",
      "games/scripts/sync.ts": 'import { Octokit } from "@octokit/rest";\n',
      "apps/web/src/stats.ts": 'const token = process.env["GITHUB_TOKEN"];\n',
      ".github/workflows/notify.yml": "      - run: curl -H \"authorization: Bearer $T\" https://api.github.com/repos/o/r/issues\n",
    });
    expect((await scanForGitHubAccess(root)).map((line) => line.split(" ")[0])).toEqual([
      ".github/workflows/notify.yml:1",
      "apps/web/src/stats.ts:1",
      "games/scripts/sync.ts:1",
      "scripts/ship.ts:1",
      "scripts/upload.ts:2",
    ]);
  });

  test("a landing script that builds its own gh call is named, and one going through scripts/github.ts is not", async () => {
    const root = tree({
      "scripts/land.ts": 'const listed = io.gh(["pr", "list", "--head", branch]);\n',
      "scripts/ci-status.ts": 'const view = run("gh", ["api", `repos/${repo}/pulls/1`]);\nconst listed = ghRun(io, [\n  "pr",\n  "list",\n]);\n',
      "scripts/land-queue.ts": "const listed = io.github.listPulls({ base, state: \"open\" });\n",
      "scripts/lane-close.ts": 'io.sh(["run", "preflight"], true);\nio.sh(["gh", "run", "rerun", id], false);\n',
      "scripts/release.ts": 'gh(["pr", "list"]);\n',
    });
    expect((await scanForGitHubAccess(root)).map((line) => line.split(" ")[0])).toEqual([
      "scripts/ci-status.ts:1",
      "scripts/ci-status.ts:2",
      "scripts/land.ts:1",
      "scripts/lane-close.ts:2",
    ]);
  });

  test("product features that serve users through GitHub, and tests, are waived", async () => {
    const root = tree({
      "packages/github/src/source.ts": "await fetch(`https://api.github.com/repos/${repo}`);\n",
      "packages/assets/src/rocketboxPull.ts": 'const ROCKETBOX_API = "https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents";\n',
      "apps/web/src/routes/api/github-proxy.ts": 'const token = process.env["GITHUB_TOKEN"] || undefined;\n',
      "scripts/pr-video.ts": 'import { uploadPoliciesAssets } from "user-attachments";\n',
      "scripts/land.test.ts": 'gh(["pr", "merge"]);\n',
    });
    expect(await scanForGitHubAccess(root)).toEqual([]);
  });

  test("a waiver covers only the routes it names", async () => {
    const root = tree({ "scripts/pr-video.ts": "await fetch(`https://api.github.com/repos/${repo}`);\n" });
    expect((await scanForGitHubAccess(root)).map((line) => line.split(" ")[0])).toEqual(["scripts/pr-video.ts:1"]);
  });

  test("this repository is clean today", async () => {
    expect(await scanForGitHubAccess()).toEqual([]);
  });
});
