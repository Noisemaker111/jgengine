// Gate: every PR that changes published-SDK source (packages/<pkg>/src) must record
// a `## [Unreleased]` entry in CHANGELOG.md, so the notes for the next publish are
// complete by construction. Wired into the PR `quick` job in .github/workflows/ci.yml.
//
// Bypass a pure refactor / test-only / internal change with `[skip changelog]` in a
// commit message. If the base ref is unavailable (shallow clone, fresh repo) the check
// skips rather than failing — CI checks out full history so the gate is live there.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const BASE_REF = process.env.CHANGELOG_BASE_REF ?? "origin/main";
const SKIP_MARKER = "[skip changelog]";
const SOURCE = /^packages\/[^/]+\/src\/.+/;
const isTest = (f: string) => /\.(test|spec)\.[tj]sx?$/.test(f);
const isChangelogMirror = (f: string) => f === "packages/core/src/meta/changelog.ts";

function git(args: string[]): { status: number; stdout: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

function unreleasedBlock(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^## \[Unreleased\]/.test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

const mergeBase = git(["merge-base", BASE_REF, "HEAD"]);
if (mergeBase.status !== 0) {
  console.log(`check-changelog: base ref ${BASE_REF} unavailable; skipping.`);
  process.exit(0);
}
const base = mergeBase.stdout.trim();

const log = git(["log", `${base}..HEAD`, "--format=%B"]);
if (log.stdout.includes(SKIP_MARKER)) {
  console.log(`check-changelog: "${SKIP_MARKER}" found in a commit message; skipping.`);
  process.exit(0);
}

const diff = git(["diff", "--name-only", `${base}..HEAD`]);
const sourceChanges = diff.stdout
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((f) => SOURCE.test(f) && !isTest(f) && !isChangelogMirror(f));

if (sourceChanges.length === 0) {
  console.log("check-changelog ok: no published-SDK source changes require an entry.");
  process.exit(0);
}

const baseChangelog = git(["show", `${base}:CHANGELOG.md`]);
const before = baseChangelog.status === 0 ? unreleasedBlock(baseChangelog.stdout) : "";
const after = unreleasedBlock(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"));

function fail(reason: string): never {
  console.error(
    `\ncheck-changelog failed: ${reason}\n\n` +
      "Add a bullet under `## [Unreleased]` in CHANGELOG.md (Migrate / Added / Changed / Removed)\n" +
      "describing the consumer-facing change, then commit it. A pure refactor, test, or internal-only\n" +
      'change can bypass with "[skip changelog]" in a commit message.\n\n' +
      `Published-SDK source changed on this branch without an [Unreleased] entry:\n${sourceChanges
        .map((f) => `  ${f}`)
        .join("\n")}\n`,
  );
  process.exit(1);
}

if (!after) fail("CHANGELOG.md has no `## [Unreleased]` section.");
if (before === after) fail("this branch changes published-SDK source but its `## [Unreleased]` section is unchanged.");

console.log(`check-changelog ok: [Unreleased] records changes for ${sourceChanges.length} source file(s).`);
