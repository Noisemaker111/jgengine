// One command for a whole release cut, so publishing is not a hand-assembled sequence:
//   bun run release              # 0.17.0 -> 0.18.0, cut CHANGELOG, mirror, regen api.md
//   bun run release --dry-run    # print the plan, write nothing
//   bun run release --no-gen     # skip the generated-artifact refresh
//   bun run release --wait           # cut, land, wait for Publish, then deploy jgengine.com from that commit
//   bun run release --wait 0.38.4    # the same wait and deploy for a version already cut (release-await.ts)
//
// The cut is written on release/<version>, cut from origin/beta, whichever checkout runs the command.
//
// A release is a milestone, not a step after each change: publish at most about once a day,
// or when an outside user needs a version. The games in games/ run engine source from the same
// commit, so nothing here has to run per PR.
// Those fragments accumulate until a cut; cutting per change cost ~40 serial minutes each and
// published 0.38.2, a patch that narrowed two public types for one field.
//
// It refuses a commit that does not contain origin/beta: a release cut from a stale main published
// `@jgengine/core@0.35.0` four merges behind beta and six game lanes could not import `agents/system`.
//
// It folds the per-PR notes in changes/*.md into `## [Unreleased]` and deletes them, runs
// set-version --release, renames `## [Unreleased]` to the new version, prepends the
// lockstep Migrate bullet, leaves a fresh empty [Unreleased], and mirrors the same notes into
// the typed CHANGELOG export in packages/core/src/meta/changelog.ts.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { foldFragments, readFragments } from "./changelog-fragments";
import { deploySite, publishThenDeploy, runStep } from "./deploy-site";
import { awaitPublish, type AwaitResult, type RunGh } from "./release-await";

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
export function plainText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

export function lockstepBullet(sdk: string, cli: string, github: string): string {
  return (
    `**Bump lockstep SDK packages to \`^${sdk}\`:** ` +
    `\`@jgengine/{core,rapier,react,ws,node,sql,convex,shell,editor,assets,navbake}\`. ` +
    `CLI \`jgengine\` is \`${cli}\`; \`@jgengine/github\` is \`${github}\`.`
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

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (args: string[], cwd: string) => GitResult;

export const runGit: GitRunner = (args, cwd) => {
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
  const log = git(["log", "--format=%h %s", `${target}..${ref}`], input.cwd);
  const missing = log.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return { ...base, ok: false, missing, reason: `${ref} has ${missing.length} commit(s) that ${target} does not contain` };
}

/** The refusal a stale release branch prints, one line per fact. */
export function ancestorFailureLines(report: AncestorReport): string[] {
  const lines = [
    `release: refusing to cut from ${report.target}: ${report.reason ?? "it does not contain the branch everything lands on"}.`,
  ];
  if (report.missing.length > 0) {
    lines.push(`release: missing from ${report.target} (${report.ref} ${report.refSha?.slice(0, 8) ?? "?"}):`);
    for (const commit of report.missing) lines.push(`  ${commit}`);
  }
  lines.push("release: merge origin/beta into the release branch and run again.");
  return lines;
}

export type ReleaseStart = { ok: true; branch: string; from: string } | { ok: false; reason: string };

/**
 * The cut goes on its own `release/<version>` branch, cut from `origin/beta` whichever checkout runs
 * the command. It used to be committed onto the branch it ran from: on `beta`, `land` refused to land
 * `beta` into itself (exit 3) after the cut was already committed there. `from` is where the checkout
 * was, so the release can switch back once it has landed.
 */
export function startReleaseBranch(input: { cwd: string; patch?: boolean; git?: GitRunner }): ReleaseStart {
  const git = input.git ?? runGit;
  const run = (args: string[]) => git(args, input.cwd);
  const status = run(["status", "--porcelain"]);
  if (status.status !== 0) return { ok: false, reason: `cannot read this checkout: ${status.stderr.trim()}` };
  if (status.stdout.trim() !== "") {
    return { ok: false, reason: "this checkout has uncommitted changes; commit or move them, then run again." };
  }
  const shown = run(["show", "origin/beta:packages/core/package.json"]);
  if (shown.status !== 0) {
    return { ok: false, reason: "cannot read origin/beta:packages/core/package.json; fetch origin beta, then run again." };
  }
  const branch = `release/${nextReleaseVersion((JSON.parse(shown.stdout) as { version: string }).version, input.patch)}`;
  if (run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).status === 0) {
    const unique = run(["rev-list", "--count", `origin/beta..${branch}`]).stdout.trim();
    if (unique !== "0") {
      return { ok: false, reason: `${branch} already has ${unique} commit(s) that origin/beta does not have; move or delete it, then run again.` };
    }
  }
  const named = run(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const from = named === "HEAD" ? run(["rev-parse", "HEAD"]).stdout.trim() : named;
  const switched = run(["switch", "-C", branch, "origin/beta"]);
  if (switched.status !== 0) return { ok: false, reason: `cannot start ${branch} from origin/beta: ${switched.stderr.trim()}` };
  return { ok: true, branch, from };
}

const KNOWN_FLAGS = ["--dry-run", "--no-gen", "--patch", "--no-fetch", "--commit", "--wait", "--run", "--sha"];

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
  if (wait !== null && wait.runId !== undefined && !Number.isInteger(wait.runId)) {
    console.error("release: --run takes a publish run id");
    process.exit(2);
  }
  if (wait !== null && wait.version !== undefined) {
    void waitForVersion(root, wait.version, wait);
    return;
  }
  if (wait !== null && (wait.runId !== undefined || wait.sha !== undefined)) {
    console.error("release: --run and --sha name a publish run, so they go with --wait <version>");
    process.exit(2);
  }
  const dryRun = args.includes("--dry-run");
  const skipGen = args.includes("--no-gen");
  const patchRelease = args.includes("--patch");
  const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");
  const version = (pkg: string) => JSON.parse(read(`packages/${pkg}/package.json`)).version as string;

  // A release cut from a stale branch is how a published version ended up missing merged work.
  if (!args.includes("--no-fetch")) spawnSync("git", ["fetch", "--quiet", "origin", "beta"], { cwd: root, stdio: "ignore", timeout: 20_000 });
  let cutFrom: string | null = null;
  if (!dryRun) {
    const start = startReleaseBranch({ cwd: root, patch: patchRelease });
    if (!start.ok) {
      console.error(`release: ${start.reason}`);
      process.exit(1);
    }
    cutFrom = start.from;
    console.log(`release: cutting on ${start.branch}, from origin/beta`);
  }
  const ancestor = checkReleaseAncestor({ cwd: root, target: args.includes("--commit") ? args[args.indexOf("--commit") + 1] : "HEAD" });
  if (!ancestor.ok) {
    for (const line of ancestorFailureLines(ancestor)) console.error(line);
    process.exit(1);
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
  const github = dryRun ? nextReleaseVersion(version("github"), patchRelease) : version("github");
  const lockstep = lockstepBullet(sdk, cli, github);
  sections.migrate.unshift(plainText(lockstep));

  const nextMarkdown = cutChangelog(markdown, sdk, lockstep);
  const nextMirror = mirrorEntry(read("packages/core/src/meta/changelog.ts"), sdk, sections);

  if (dryRun) {
    console.log(`release --dry-run: would cut ${sdk} (CLI ${cli}, @jgengine/github ${github}), folding ${fragments.length} fragment(s)`);
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
  if (wait !== null && cutFrom !== null) void landAndAwait(root, sdk, cutFrom);
  else console.log("release: review the diff, then commit and open the release PR.");
}

export interface WaitRequest {
  /** The version already cut. Absent means cut, land and wait. */
  version?: string | undefined;
  runId?: number | undefined;
  sha?: string | undefined;
}

/** `--wait` cuts, lands and waits; `--wait <version>` only waits on a version already cut. Null without `--wait`. */
export function waitRequest(args: readonly string[]): WaitRequest | null {
  const at = args.indexOf("--wait");
  if (at < 0) return null;
  const next = args[at + 1];
  const value = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
  };
  const run = value("--run");
  return {
    version: next !== undefined && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next) ? next : undefined,
    runId: run === undefined ? undefined : Number(run),
    sha: value("--sha"),
  };
}

/**
 * `--wait <version>`: the version is already cut and on main. Wait for its Publish run, then deploy
 * jgengine.com from the commit that run published, the same tail `--wait` runs after a cut. A failed
 * deploy is retried by running this again, not by hand.
 */
async function waitForVersion(root: string, version: string, wait: WaitRequest): Promise<never> {
  spawnSync("git", ["fetch", "--quiet", "origin", "main"], { cwd: root, stdio: "ignore", timeout: 20_000 });
  const sha = resolveCommit(root, wait.sha ?? "origin/main");
  if (sha === "") {
    console.error(`release: cannot resolve ${wait.sha ?? "origin/main"} to a commit`);
    process.exit(1);
  }
  const code = await publishThenDeploy(
    () => awaitPublish({ version, sha, runId: wait.runId, gh: ghIn(root), log: (line) => console.log(line) }),
    () => deploySite(root, runStep, sha),
  );
  process.exit(code);
}

function resolveCommit(root: string, rev: string): string {
  const out = spawnSync("git", ["rev-parse", "--verify", "--quiet", rev], { cwd: root, encoding: "utf8" });
  return out.status === 0 ? out.stdout.trim() : "";
}

/** `gh` run in the release folder, so it reads that repository. */
function ghIn(root: string): RunGh {
  return (args) => {
    const result = spawnSync("gh", [...args], { cwd: root, encoding: "utf8" });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

/**
 * The rest of a release that a lane used to do by hand: commit, hand the PR to `land` (which pushes,
 * opens it and arms auto-merge), wait for the merge, fast-forward `main`, then wait for the Publish
 * run, deploy jgengine.com from the released commit, and answer with the version. `--wait` is what keeps a lane out of `Start-Sleep 480; gh run view`.
 */
async function landAndAwait(root: string, version: string, cutFrom: string): Promise<never> {
  const git = (args: readonly string[]) => spawnSync("git", [...args], { cwd: root, encoding: "utf8" });
  const commit = git(["add", "-A"]);
  if (commit.status !== 0) {
    console.error(`release: staging the cut failed: ${commit.stderr.trim()}`);
    process.exit(1);
  }
  const staged = git(["diff", "--cached", "--quiet"]);
  if (staged.status !== 0) {
    const made = git(["commit", "-m", `Release ${version}`]);
    if (made.status !== 0) {
      console.error(`release: committing the cut failed: ${made.stderr.trim()}`);
      process.exit(1);
    }
  }
  const land = spawnSync("bun", ["scripts/land.ts"], { cwd: root, stdio: "inherit" });
  if (land.status !== 0) {
    console.error("release: land did not finish; the cut is committed on this branch and the PR is not armed");
    process.exit(land.status ?? 1);
  }

  const gh = ghIn(root);
  const merged = await waitForMerge(gh);
  if (merged === null) process.exit(1);
  const forward = fastForwardMain(git);
  if (!forward.ok) {
    console.error(`release: fast-forwarding main failed: ${forward.error}`);
    process.exit(1);
  }
  const back = git(["checkout", "--quiet", cutFrom]);
  if (back.status !== 0) console.error(`release: published, but this checkout did not switch back to ${cutFrom}: ${back.stderr.trim()}`);
  // The site deploy runs here, not in CI, because its build needs game models.
  const published = await publishFollowingBeta({
    sha: forward.sha,
    publish: (sha) => awaitPublish({ version, sha, gh, log: (line) => console.log(line) }),
    pushTip: () => fastForwardMain(git),
    log: (line) => console.log(line),
  });
  if (!published.ok) {
    console.error(`release: ${published.error}`);
    process.exit(1);
  }
  const code = await publishThenDeploy(
    async () => published.result,
    () => deploySite(root, runStep, published.sha),
  );
  process.exit(code);
}

/**
 * Publish `sha`. Beta can move while Publish runs, and Publish refuses a commit beta has already
 * passed: the 0.47.0 cut was refused when #2575 merged between its push and its Publish check. So a
 * failed publish pushes beta's tip to `main` and publishes that instead, at most twice.
 */
export async function publishFollowingBeta(input: {
  sha: string;
  publish: (sha: string) => Promise<AwaitResult>;
  pushTip: () => { ok: true; sha: string } | { ok: false; error: string };
  log: (line: string) => void;
  retries?: number;
}): Promise<{ ok: true; sha: string; result: AwaitResult } | { ok: false; error: string }> {
  let sha = input.sha;
  let result = await input.publish(sha);
  for (let retry = 0; !result.ok && retry < (input.retries ?? 2); retry++) {
    const tip = input.pushTip();
    if (!tip.ok) return { ok: false, error: `fast-forwarding main failed: ${tip.error}` };
    if (tip.sha === sha) break;
    input.log(`release: beta moved to ${tip.sha.slice(0, 8)} while Publish ran; publishing that commit`);
    sha = tip.sha;
    result = await input.publish(sha);
  }
  return { ok: true, sha, result };
}

/**
 * Push the merged release to `main`. The local `origin/beta` ref predates the merge `land` waited
 * for, so it is fetched first: pushing the stale ref moved `main` to the commit before the release
 * and 0.40.0 sat unpublished.
 */
export function fastForwardMain(
  git: (args: readonly string[]) => { status: number | null; stdout: string; stderr: string },
): { ok: true; sha: string } | { ok: false; error: string } {
  const fetched = git(["fetch", "--quiet", "origin", "beta"]);
  if (fetched.status !== 0) return { ok: false, error: `fetching origin/beta: ${fetched.stderr.trim()}` };
  const tip = git(["rev-parse", "origin/beta"]);
  if (tip.status !== 0) return { ok: false, error: `reading origin/beta: ${tip.stderr.trim()}` };
  const sha = tip.stdout.trim();
  const pushed = git(["push", "origin", `${sha}:main`]);
  if (pushed.status !== 0) return { ok: false, error: pushed.stderr.trim() };
  return { ok: true, sha };
}

/** The release PR's own merge is the event the publish run follows, so this waits on that state. */
async function waitForMerge(
  gh: (args: readonly string[]) => { status: number; stdout: string; stderr: string },
): Promise<string | null> {
  const deadline = Date.now() + 45 * 60_000;
  while (Date.now() < deadline) {
    const state = gh(["pr", "view", "--json", "state,number"]).stdout.trim();
    if (state !== "") {
      try {
        const parsed = JSON.parse(state) as { state?: string; number?: number };
        if (parsed.state === "MERGED") return String(parsed.number ?? "");
        if (parsed.state === "CLOSED") {
          console.error("release: the release PR was closed without merging, so nothing was published");
          return null;
        }
      } catch {
        // A shape this does not know is not a merge; keep waiting inside the budget.
      }
    }
    // wait-ok: the release PR's checks take minutes and the merge is the event this waits for; bounded above
    await Bun.sleep(15_000);
  }
  console.error("release: the release PR did not merge within 45 minutes; nothing was published");
  return null;
}

/** Compute the version a normal or patch release will publish. */
export function nextReleaseVersion(version: string, patchRelease = false): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) throw new Error(`unparseable version: ${version}`);
  const [, major, minor, patch] = match;
  return version.includes("-") ? `${major}.${minor}.${patch}` : patchRelease ? `${major}.${minor}.${Number(patch) + 1}` : `${major}.${Number(minor) + 1}.0`;
}

if (import.meta.main) main();
