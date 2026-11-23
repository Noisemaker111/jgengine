// One command for a whole release. beta is the only branch: the cut is one commit on it, and a
// `v<version>` tag on that commit is what publishes.
//   bun run release              # 0.17.0 -> 0.18.0: cut, commit to beta, wait for CI, tag, publish, deploy
//   bun run release --patch      # 0.17.0 -> 0.17.1, for a fixes-only release
//   bun run release --dry-run    # print the plan, write nothing
//   bun run release --wait 0.38.4             # finish a release already cut: CI, tag, publish, deploy
//   bun run release --wait 0.38.4 --sha <c>   # the same, tagging a later beta commit (a fix forward)
//
// A release is a milestone, not a step after each change: publish at most about once a day,
// or when an outside user needs a version. The games in games/ run engine source from the same
// commit, so nothing here has to run per PR.
//
// The cut starts from origin/beta's tip, folds the per-PR notes in changes/*.md into
// `## [Unreleased]` and deletes them, runs set-version --release, renames `## [Unreleased]` to the
// new version, prepends the lockstep Migrate bullet, leaves a fresh empty [Unreleased], and mirrors
// the same notes into the typed CHANGELOG export in packages/core/src/meta/changelog.ts.
//
// The tag is pushed only once beta's CI is green on the commit, so publish.yml (which runs on the
// tag) never starts on an unproved commit. Before this, a release was a release/<version> branch,
// a PR into beta, a fast-forward of a second branch `main`, a second full CI run there, and a
// Publish run chained to that CI: 17 release PRs in three weeks, and Publish failed 14 of 40 runs,
// several because beta moved while main's CI ran.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foldFragments, readFragments } from "./changelog-fragments";
import { deploySite, publishThenDeploy, runStep } from "./deploy-site";
import { awaitCi, awaitPublish, type RunGh } from "./release-await";

export interface ChangelogSections {
  migrate: string[];
  added: string[];
  changed: string[];
  removed: string[];
}

const HEADING_TO_KEY: Record<string, keyof ChangelogSections> = {
  migrate: "migrate",
  added: "added",
  changed: "changed",
  removed: "removed",
  fixed: "changed",
};

/** Slice the lines of one `## ` section out of a markdown document. */
export function sectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/** Split `<!-- ... -->` guidance from the authored bullets of an `## [Unreleased]` block. */
export function splitComment(lines: string[]): { comment: string[]; body: string[] } {
  const comment: string[] = [];
  const body: string[] = [];
  let inComment = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("<!--")) inComment = true;
    if (inComment) {
      comment.push(line);
      if (line.includes("-->")) inComment = false;
      continue;
    }
    body.push(line);
  }
  return { comment, body };
}

/** Markdown bullets under `### Migrate|Added|Changed|Removed|Fixed` as plain one-line strings. */
export function parseSections(lines: string[]): ChangelogSections {
  const sections: ChangelogSections = { migrate: [], added: [], changed: [], removed: [] };
  let key: keyof ChangelogSections | null = null;
  let current: string[] = [];
  const flush = () => {
    if (key && current.length > 0) sections[key].push(plainText(current.join(" ")));
    current = [];
  };
  for (const line of lines) {
    const heading = /^###\s+(\w+)/.exec(line);
    if (heading) {
      flush();
      key = HEADING_TO_KEY[(heading[1] ?? "").toLowerCase()] ?? null;
      continue;
    }
    if (/^-\s+/.test(line)) {
      flush();
      current = [line.replace(/^-\s+/, "")];
      continue;
    }
    if (current.length > 0 && line.trim() !== "") current.push(line.trim());
    else if (line.trim() === "") flush();
  }
  flush();
  return sections;
}

/** Bold markers and wrapped whitespace do not survive into the typed mirror. */
function plainText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function lockstepBullet(sdk: string, cli: string): string {
  return (
    `**Bump lockstep SDK packages to \`^${sdk}\`:** ` +
    `\`@jgengine/{core,rapier,ws,node,sql,convex,editor,assets,navbake}\`. ` +
    `CLI \`jgengine\` is \`${cli}\`.`
  );
}

/** Rename `## [Unreleased]` to `## <version>`, prepend the lockstep bullet, leave a fresh block. */
export function cutChangelog(markdown: string, version: string, lockstep: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## [Unreleased]");
  if (start < 0) throw new Error("CHANGELOG.md has no `## [Unreleased]` heading.");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  const { comment, body } = splitComment(lines.slice(start + 1, end));
  const released = withLockstep(trimBlank(body), lockstep);
  const replacement = [
    "## [Unreleased]",
    "",
    ...trimBlank(comment),
    "",
    `## ${version}`,
    "",
    ...released,
    "",
  ];
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

function withLockstep(body: string[], lockstep: string): string[] {
  const migrateAt = body.findIndex((l) => /^###\s+Migrate\b/i.test(l));
  if (migrateAt < 0) return ["### Migrate", "", `- ${lockstep}`, "", ...body];
  const insertAt = body.findIndex((l, i) => i > migrateAt && /^-\s+/.test(l));
  const at = insertAt < 0 ? migrateAt + 2 : insertAt;
  return [...body.slice(0, at), `- ${lockstep}`, ...body.slice(at)];
}

function trimBlank(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a]?.trim() === "") a++;
  while (b > a && lines[b - 1]?.trim() === "") b--;
  return lines.slice(a, b);
}

/** Insert the new version's typed entry at the top of the `CHANGELOG` record. */
export function mirrorEntry(source: string, version: string, sections: ChangelogSections): string {
  const anchor = "export const CHANGELOG: Record<string, ChangelogEntry> = {";
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error("changelog.ts has no CHANGELOG record to mirror into.");
  if (source.includes(`\n  "${version}": {`)) throw new Error(`changelog.ts already has a ${version} entry.`);
  const field = (key: keyof ChangelogSections) =>
    sections[key].length === 0
      ? `    ${key}: [],`
      : [`    ${key}: [`, ...sections[key].map((b) => `      ${JSON.stringify(b)},`), "    ],"].join("\n");
  const entry = [
    `  "${version}": {`,
    field("migrate"),
    field("added"),
    field("changed"),
    field("removed"),
    "  },",
  ].join("\n");
  const cut = at + anchor.length;
  return `${source.slice(0, cut)}\n${entry}${source.slice(cut)}`;
}

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[], cwd: string) => GitResult;

const runGit: GitRunner = (args, cwd) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

export interface AncestorReport {
  ok: boolean;
  ref: string;
  target: string;
  targetSha: string | null;
  refSha: string | null;
  /** `<short sha> <subject>` for every commit on `ref` the target does not contain. */
  missing: string[];
  reason: string | null;
}

/**
 * A release may only be cut from a commit that contains the branch everything lands on. A release
 * cut from a stale `main` published `@jgengine/core@0.35.0` four merges behind `beta`, and six game
 * lanes could not import the `agents/system` module that had already merged.
 */
export function checkReleaseAncestor(input: {
  cwd: string;
  ref?: string;
  target?: string | undefined;
  git?: GitRunner;
  /**
   * Publishing, not cutting: a target already on `ref` landed through it, so it holds everything `ref`
   * had when it merged, and `ref` moving on since is no reason to refuse it. Publish refused 0.54.0
   * because #3056 merged during main's CI; a cut still needs `ref`'s tip.
   */
  landed?: boolean;
}): AncestorReport {
  const git = input.git ?? runGit;
  const ref = input.ref ?? "origin/beta";
  const target = input.target ?? "HEAD";
  const resolve = (rev: string): string | null => {
    const out = git(["rev-parse", "--verify", `${rev}^{commit}`], input.cwd);
    return out.status === 0 ? out.stdout.trim() : null;
  };
  const targetSha = resolve(target);
  const refSha = resolve(ref);
  const base = { ref, target, targetSha, refSha };
  if (targetSha === null) return { ...base, ok: false, missing: [], reason: `cannot resolve ${target} as a commit` };
  if (refSha === null) {
    return { ...base, ok: false, missing: [], reason: `cannot resolve ${ref}, so the release cannot prove it contains the branch everything lands on` };
  }
  if (git(["merge-base", "--is-ancestor", ref, target], input.cwd).status === 0) {
    return { ...base, ok: true, missing: [], reason: null };
  }
  if (input.landed === true && git(["merge-base", "--is-ancestor", target, ref], input.cwd).status === 0) {
    return { ...base, ok: true, missing: [], reason: null };
  }
  const log = git(["log", "--format=%h %s", `${target}..${ref}`], input.cwd);
  const missing = log.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { ...base, ok: false, missing, reason: `${ref} has ${missing.length} commit(s) that ${target} does not contain` };
}

/** The refusal a commit off beta prints, one line per fact. */
export function ancestorFailureLines(report: AncestorReport): string[] {
  const lines = [
    `release: refusing to publish ${report.target}: ${report.reason ?? "it is not on the branch everything lands on"}.`,
  ];
  if (report.missing.length > 0) {
    lines.push(`release: missing from ${report.target} (${report.ref} ${report.refSha?.slice(0, 8) ?? "?"}):`);
    for (const commit of report.missing) lines.push(`  ${commit}`);
  }
  lines.push("release: a release tags a commit on beta; run `bun run release` from beta's tip.");
  return lines;
}

export type ReleaseStart = { ok: true; from: string } | { ok: false; reason: string };

/**
 * The cut starts on origin/beta's tip, detached, whichever checkout runs the command, and is pushed
 * from there straight to beta. `from` is where the checkout was, so the release can switch back.
 */
export function startReleaseCut(input: { cwd: string; git?: GitRunner }): ReleaseStart {
  const git = input.git ?? runGit;
  const run = (args: string[]) => git(args, input.cwd);
  const status = run(["status", "--porcelain"]);
  if (status.status !== 0) return { ok: false, reason: `cannot read this checkout: ${status.stderr.trim()}` };
  if (status.stdout.trim() !== "") {
    return { ok: false, reason: "this checkout has uncommitted changes; commit or move them, then run again." };
  }
  const named = run(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const from = named === "HEAD" ? run(["rev-parse", "HEAD"]).stdout.trim() : named;
  const switched = run(["switch", "--detach", "origin/beta"]);
  if (switched.status !== 0) return { ok: false, reason: `cannot start the cut at origin/beta: ${switched.stderr.trim()}` };
  return { ok: true, from };
}

const KNOWN_FLAGS = ["--dry-run", "--no-gen", "--patch", "--no-fetch", "--wait", "--sha"];

/** The first `--flag` this script does not take. A retired flag fails here instead of falling through to a cut. */
export function unknownFlag(args: readonly string[]): string | undefined {
  return args.find((arg) => arg.startsWith("--") && !KNOWN_FLAGS.includes(arg));
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const args = process.argv.slice(2);
  const unknown = unknownFlag(args);
  if (unknown !== undefined) {
    console.error(`release: unknown argument ${unknown}`);
    process.exit(2);
  }
  const wait = waitRequest(args);
  if (wait !== null) {
    if (wait.version === undefined) {
      console.error("release: --wait takes the version to finish, e.g. --wait 0.58.0");
      process.exit(2);
    }
    void resumeRelease(root, wait.version, wait.sha);
    return;
  }
  if (args.includes("--sha")) {
    console.error("release: --sha names the commit to tag, so it goes with --wait <version>");
    process.exit(2);
  }
  const dryRun = args.includes("--dry-run");
  const skipGen = args.includes("--no-gen");
  const patchRelease = args.includes("--patch");
  const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");
  const version = (pkg: string) => JSON.parse(read(`packages/${pkg}/package.json`)).version as string;

  // Every package must already take trusted publishing, or Publish stops part-way and `latest` points at
  // a set that cannot install (0.56.0 published five packages, then npm had never heard of @jgengine/core/ui.view).
  const trusted = spawnSync("bun", ["scripts/check-npm-trusted.ts"], { cwd: root, stdio: "inherit" });
  if (trusted.status !== 0) {
    console.error("release: stopped before cutting; nothing was published.");
    process.exit(1);
  }

  if (!args.includes("--no-fetch")) spawnSync("git", ["fetch", "--quiet", "origin", "beta"], { cwd: root, stdio: "ignore", timeout: 20_000 });
  let cutFrom: string | null = null;
  if (!dryRun) {
    const start = startReleaseCut({ cwd: root });
    if (!start.ok) {
      console.error(`release: ${start.reason}`);
      process.exit(1);
    }
    cutFrom = start.from;
    console.log("release: cutting on origin/beta's tip");
  }

  // Build and check the site before cutting anything. Publishing first and building the site after once
  // left 0.52.0 on npm with jgengine.com still on 0.51.0, because 8 game bundles failed the site's asset
  // check. Nothing is bumped, committed or published until the site this release would deploy passes.
  if (!dryRun) {
    const site = deploySite(root, runStep, "HEAD", "check");
    console.log(site.line);
    if (!site.ok) {
      console.error("release: stopped before cutting; nothing was published. Fix the site, then run the release again.");
      switchBack(root, cutFrom);
      process.exit(1);
    }
  }

  const changelogPath = `${root}CHANGELOG.md`;
  const mirrorPath = `${root}packages/core/src/meta/changelog.ts`;
  const fragments = readFragments(root);
  const markdown = foldFragments(read("CHANGELOG.md"), fragments.map((f) => f.text));
  const unreleased = splitComment(sectionLines(markdown, "## [Unreleased]")).body;
  const sections = parseSections(unreleased);
  const total = Object.values(sections).reduce((n, list) => n + list.length, 0);
  if (total === 0) {
    console.error("release: `## [Unreleased]` has no entries — nothing to cut.");
    switchBack(root, cutFrom);
    process.exit(1);
  }

  if (!dryRun) {
    const bump = spawnSync("bun", ["scripts/set-version.ts", "--release", ...(patchRelease ? ["--patch"] : [])], { cwd: root, stdio: "inherit" });
    if (bump.status !== 0) process.exit(bump.status ?? 1);
    // Workspace versions live in bun.lock too; without this the lockfile keeps the old release.
    const lock = spawnSync("bun", ["install"], { cwd: root, stdio: "inherit" });
    if (lock.status !== 0) process.exit(lock.status ?? 1);
  }

  const sdk = dryRun ? nextReleaseVersion(version("core"), patchRelease) : version("core");
  const cli = dryRun ? nextReleaseVersion(version("jgengine"), patchRelease) : version("jgengine");
  const lockstep = lockstepBullet(sdk, cli);
  sections.migrate.unshift(plainText(lockstep));

  const nextMarkdown = cutChangelog(markdown, sdk, lockstep);
  const nextMirror = mirrorEntry(read("packages/core/src/meta/changelog.ts"), sdk, sections);

  if (dryRun) {
    console.log(`release --dry-run: would cut ${sdk} (CLI ${cli}), folding ${fragments.length} fragment(s)`);
    for (const key of ["migrate", "added", "changed", "removed"] as const) {
      console.log(`  ${key}: ${sections[key].length}`);
    }
    return;
  }

  writeFileSync(changelogPath, nextMarkdown);
  writeFileSync(mirrorPath, nextMirror);
  for (const fragment of fragments) rmSync(fragment.path);
  console.log(`release: cut ${sdk} - CHANGELOG.md and the typed mirror now carry ${total + 1} note(s).`);

  if (!skipGen) {
    const gen = spawnSync("bun", ["scripts/gen-skill-api-safe.ts"], { cwd: root, stdio: "inherit" });
    if (gen.status !== 0) process.exit(gen.status ?? 1);
  }
  void commitAndRelease(root, sdk, cutFrom);
}

export interface WaitRequest {
  /** The version already cut; absent when `--wait` names none. */
  version?: string | undefined;
  /** A later beta commit to tag instead of the cut, for a release whose own commit CI failed. */
  sha?: string | undefined;
}

/** `--wait <version>` finishes a release already cut. Null without `--wait`. */
export function waitRequest(args: readonly string[]): WaitRequest | null {
  const at = args.indexOf("--wait");
  if (at < 0) return null;
  const next = args[at + 1];
  const sha = args.indexOf("--sha");
  return {
    version: next !== undefined && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next) ? next : undefined,
    sha: sha < 0 ? undefined : args[sha + 1],
  };
}

type Git = (args: readonly string[]) => { status: number | null; stdout: string; stderr: string };

function gitIn(root: string): Git {
  return (args) => spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
}

function switchBack(root: string, from: string | null): void {
  if (from === null) return;
  const back = gitIn(root)(["switch", "--quiet", ...(/^[0-9a-f]{40}$/.test(from) ? ["--detach"] : []), from]);
  if (back.status !== 0) console.error(`release: this checkout did not switch back to ${from}: ${back.stderr.trim()}`);
}

/**
 * Commit the cut and push it straight to beta. The push is a fast-forward or nothing: a beta that
 * moved during the cut refuses it, and the release is run again from the new tip.
 */
async function commitAndRelease(root: string, version: string, from: string | null): Promise<never> {
  const git = gitIn(root);
  const fail = (line: string): never => {
    console.error(line);
    process.exit(1);
  };
  if (git(["add", "-A"]).status !== 0) fail("release: staging the cut failed");
  const made = git(["commit", "--quiet", "-m", `Release ${version}`]);
  if (made.status !== 0) fail(`release: committing the cut failed: ${made.stderr.trim()}`);
  const sha = git(["rev-parse", "HEAD"]).stdout.trim();
  const pushed = git(["push", "origin", `${sha}:refs/heads/beta`]);
  if (pushed.status !== 0) {
    switchBack(root, from);
    fail(`release: beta refused the cut (${pushed.stderr.trim()}); nothing was tagged or published. Run \`bun run release\` again from beta's new tip.`);
  }
  console.log(`release: Release ${version} is on beta as ${sha.slice(0, 8)}`);
  switchBack(root, from);
  process.exit(await finishRelease(root, version, sha));
}

/**
 * `--wait <version>`: finish a release whose cut is already on beta. The commit is `--sha`, else the
 * commit its tag names, else beta's `Release <version>` commit.
 */
async function resumeRelease(root: string, version: string, sha?: string): Promise<never> {
  const git = gitIn(root);
  spawnSync("git", ["fetch", "--quiet", "--tags", "origin", "beta"], { cwd: root, stdio: "ignore", timeout: 30_000 });
  const tagged = git(["rev-parse", "--verify", "--quiet", `refs/tags/v${version}^{commit}`]).stdout.trim();
  const cut = git(["log", "origin/beta", "--format=%H", "--extended-regexp", `--grep=^Release ${version.replaceAll(".", "\\.")}$`, "-1"]).stdout.trim();
  const target = sha === undefined ? tagged || cut : git(["rev-parse", "--verify", "--quiet", `${sha}^{commit}`]).stdout.trim();
  if (target === "") {
    console.error(`release: no commit to release ${version} from: no v${version} tag and no "Release ${version}" commit on origin/beta`);
    process.exit(1);
  }
  process.exit(await finishRelease(root, version, target));
}

/**
 * Wait for beta's CI on `sha`, tag it `v<version>` (which starts publish.yml), wait for npm to serve
 * the release, then deploy jgengine.com from the same commit. The site deploy runs here, not in CI,
 * because its build needs game models.
 */
async function finishRelease(root: string, version: string, sha: string): Promise<number> {
  const git = gitIn(root);
  const gh = ghIn(root);
  const log = (line: string) => console.log(line);
  const tag = `v${version}`;
  const existing = git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`]).stdout.trim();
  if (existing !== "" && existing !== sha) {
    console.error(`release: ${tag} already names ${existing.slice(0, 8)}, not ${sha.slice(0, 8)}; a published tag is never moved`);
    return 1;
  }
  if (existing === "") {
    const ci = await awaitCi({ sha, gh, log });
    console.log(ci.line);
    if (!ci.ok) return 1;
    const made = git(["tag", "--annotate", tag, sha, "--message", `Release ${version}`]);
    if (made.status !== 0) {
      console.error(`release: tagging ${sha.slice(0, 8)} failed: ${made.stderr.trim()}`);
      return 1;
    }
  }
  const pushed = git(["push", "origin", `refs/tags/${tag}`]);
  if (pushed.status !== 0) {
    console.error(`release: pushing ${tag} failed: ${pushed.stderr.trim()}`);
    return 1;
  }
  console.log(`release: pushed ${tag} on ${sha.slice(0, 8)}; publish.yml runs on it`);
  return publishThenDeploy(
    () => awaitPublish({ version, sha, gh, log }),
    () => deploySite(root, runStep, sha),
  );
}

/** `gh` run in the release folder, so it reads that repository. */
function ghIn(root: string): RunGh {
  return (args) => {
    const result = spawnSync("gh", [...args], { cwd: root, encoding: "utf8" });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

/** Compute the version a normal or patch release will publish. */
export function nextReleaseVersion(version: string, patchRelease = false): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`unparseable version: ${version}`);
  const [, major, minor, patch] = match;
  return version.includes("-") ? `${major}.${minor}.${patch}` : patchRelease ? `${major}.${minor}.${Number(patch) + 1}` : `${major}.${Number(minor) + 1}.0`;
}

if (import.meta.main) main();
