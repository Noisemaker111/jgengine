// Gate: every PR that changes published-SDK source (packages/<pkg>/src) must add a note
// file under changes/ (folded into CHANGELOG.md by `bun run release`), so the notes for the
// next publish are complete by construction. A release may move notes into its new version section.
// Wired into the PR `quick` job in .github/workflows/ci.yml.
//
// Bypass a pure refactor / test-only / internal change with `[skip changelog]` in a
// commit message. If the base ref is unavailable (shallow clone, fresh repo) the check
// skips rather than failing — CI checks out full history so the gate is live there.
// These exemptions waive the requirement for a new note, never validation of existing notes.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { FRAGMENT_PATTERN, groupByHeading, readFragments } from "./changelog-fragments";

const root = fileURLToPath(new URL("..", import.meta.url));
const BASE_REF = process.env.CHANGELOG_BASE_REF ?? "origin/main";
const SKIP_MARKER = "[skip changelog]";
const SOURCE = /^packages\/[^/]+\/src\/.+/;
const isNotShipped = (f: string) => /\.(test|spec)\.[tj]sx?$/.test(f) || /\.mdx?$/i.test(f);
const isChangelogMirror = (f: string) => f === "packages/core/src/meta/changelog.ts";

function git(args: string[]): { status: number; stdout: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

function sectionBlock(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
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

// A release folds every note, including notes predating this diff. Validate them before
// unavailable-base, skip-marker and source-free branches can exit successfully.
for (const fragment of readFragments(root)) {
  const groups = groupByHeading(fragment.text.split("\n"));
  if (![...groups].some(([heading, body]) =>
    /^(Migrate|Added|Changed|Fixed|Removed)$/.test(heading) && body.some((line) => /^-\s+\S/.test(line)),
  )) {
    console.error(`\ncheck-changelog failed: ${relative(root, fragment.path)} needs a ### Migrate/Added/Changed/Fixed/Removed heading with a bullet under it.\n`);
    process.exit(1);
  }
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

const changedFiles = (filter?: string) =>
  git(["diff", "--name-only", ...(filter ? [`--diff-filter=${filter}`] : []), `${base}..HEAD`])
    .stdout.split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const sourceChanges = changedFiles().filter((f) => SOURCE.test(f) && !isNotShipped(f) && !isChangelogMirror(f));

if (sourceChanges.length === 0) {
  console.log("check-changelog ok: no published-SDK source changes require an entry.");
  process.exit(0);
}

const fragments = changedFiles("AM").filter((f) => FRAGMENT_PATTERN.test(f));
if (fragments.length > 0) {
  console.log(`check-changelog ok: ${fragments.join(", ")} records changes for ${sourceChanges.length} source file(s).`);
  process.exit(0);
}

const baseChangelog = git(["show", `${base}:CHANGELOG.md`]);
const before = baseChangelog.status === 0 ? sectionBlock(baseChangelog.stdout, "## [Unreleased]") : "";
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const after = sectionBlock(changelog, "## [Unreleased]");
const coreBefore = git(["show", `${base}:packages/core/package.json`]);
const coreAfter = git(["show", "HEAD:packages/core/package.json"]);
if (coreBefore.status === 0 && coreAfter.status === 0) {
  const previous: unknown = JSON.parse(coreBefore.stdout).version;
  const version: unknown = JSON.parse(coreAfter.stdout).version;
  const stable = (value: unknown): value is string => typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value);
  if (stable(previous) && stable(version)) {
    const oldParts = previous.split(".").map(Number);
    const parts = version.split(".").map(Number);
    const changedPart = parts.findIndex((part, i) => part !== oldParts[i]);
    const heading = `## ${version}`;
    const release = sectionBlock(changelog, heading);
    const groups = groupByHeading(release.replace(/<!--[\s\S]*?-->/g, "").split("\n"));
    const hasConsumerNotes = [...groups].some(([name, body]) =>
      /^(Migrate|Added|Changed|Fixed|Removed)$/.test(name) && body.some((line) =>
        /^-\s+\S/.test(line) && !/^-\s+\*?\*?Bump lockstep SDK packages to /.test(line),
      ),
    );
    if (changedPart >= 0 && parts[changedPart]! > oldParts[changedPart]! &&
        !sectionBlock(baseChangelog.stdout, heading) && hasConsumerNotes) {
      console.log(`check-changelog ok: ${heading} records the release for ${sourceChanges.length} source file(s).`);
      process.exit(0);
    }
  }
}

function fail(reason: string): never {
  console.error(
    `\ncheck-changelog failed: ${reason}\n\n` +
      "Add changes/<branch-name>.md with a `### Migrate|Added|Changed|Fixed|Removed` heading and a\n" +
      "bullet describing the consumer-facing change, then commit it (see changes/README.md).\n" +
      'A pure refactor, test, or internal-only change can bypass with "[skip changelog]" in a commit message.\n\n' +
      `Published-SDK source changed on this branch without an [Unreleased] entry:\n${sourceChanges
        .map((f) => `  ${f}`)
        .join("\n")}\n`,
  );
  process.exit(1);
}

if (!after) fail("CHANGELOG.md has no `## [Unreleased]` section.");
if (before === after) fail("this branch changes published-SDK source but its `## [Unreleased]` section is unchanged.");

console.log(`check-changelog ok: [Unreleased] records changes for ${sourceChanges.length} source file(s).`);
