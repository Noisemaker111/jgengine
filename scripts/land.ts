// One command that lands a branch on beta, so landing is not a hand-assembled
// sequence of push, open, arm and wait:
//   bun run land
//   bun run land --verify "bun run ship:preflight"
//   bun run land --title "Menus" --body-file .scratch/body.md
//
// It refuses on `main` or a dirty tree, pushes, rebases onto the base, reuses
// an open PR or opens one (body: the newest changes/ fragment, else
// --body-file, else a one-line summary), runs --verify, watches checks for up
// to 25 minutes, merges and waits for MERGED. Exit codes: 0 landed, 1 verify
// failed, 2 checks failed, 3 could not merge (including a refused branch or
// dirty tree).
//
// The branch land pushed is land's to rewrite: its own rebase would otherwise
// leave the next push non-fast-forward and send the worker to a hand-typed
// force (#2120). Land force-pushes with a lease on that branch, and only after
// its own push in this run succeeded — a branch it did not push is refused.
//
// Landings are serialised. Every landing rebases, pushes and merges against the
// same base, and each open PR spends sixteen of the account's twenty job slots,
// so a second landing that starts at the same moment only makes both slower.
// The lock is one file in the repo's git directory: every worktree of the repo
// shares it (so lanes queue with each other, not just with themselves), and it
// cannot show up in `git status` to trip land's own dirty-tree check.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAGMENT_PATTERN } from "./changelog-fragments";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_LANDED = 0;
export const EXIT_VERIFY_FAILED = 1;
export const EXIT_CHECKS_FAILED = 2;
export const EXIT_COULD_NOT_MERGE = 3;

const CHECKS_APPEAR_TIMEOUT_MS = 5 * 60_000;
const WATCH_TIMEOUT_MS = 25 * 60_000;
const MERGED_TIMEOUT_MS = 20 * 60_000;
const POLL_INTERVAL_MS = 15_000;

export interface LandArgs {
  title?: string;
  bodyFile?: string;
  verify?: string;
  base: string;
}

/** `--title`, `--body-file`, `--verify` and `--base beta`; anything else is a typo. */
export function parseArgs(argv: readonly string[]): LandArgs {
  const args: LandArgs = { base: "beta" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--title") args.title = value(argv, (i += 1), arg);
    else if (arg === "--body-file") args.bodyFile = value(argv, (i += 1), arg);
    else if (arg === "--verify") args.verify = value(argv, (i += 1), arg);
    else if (arg === "--base") args.base = value(argv, (i += 1), arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

/**
 * The note file for this PR: the fragment named after the branch, since a fresh checkout gives
 * every fragment the same mtime, else the newest one.
 */
export function pickFragment(
  files: readonly { path: string; text: string; mtimeMs: number }[],
  branch?: string,
): { path: string; text: string } | null {
  if (branch !== undefined) {
    const named = files.find((file) => basename(file.path) === `${branch.replace(/\//g, "-")}.md`);
    if (named !== undefined) return { path: named.path, text: named.text };
  }
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  const newest = sorted[0];
  return newest === undefined ? null : { path: newest.path, text: newest.text };
}

export function readNewestFragment(branch: string, dir = join(root, "changes")): { path: string; text: string } | null {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const files = names
    .filter((name) => FRAGMENT_PATTERN.test(`changes/${name}`))
    .map((name) => {
      const path = join(dir, name);
      return { path, text: readFileSync(path, "utf8"), mtimeMs: statSync(path).mtimeMs };
    });
  return pickFragment(files, branch);
}

/** Fragment first, then an explicit body file, then a one-line summary. */
export function chooseBody(sources: {
  fragment?: string | null;
  bodyFile?: string | null;
  summary: string;
}): string {
  const fragment = sources.fragment?.trim() ?? "";
  if (fragment.length > 0) return fragment;
  const bodyFile = sources.bodyFile?.trim() ?? "";
  if (bodyFile.length > 0) return bodyFile;
  return sources.summary.trim();
}

export interface GhCheck {
  name: string;
  state: string;
  bucket?: string;
  link?: string;
}

export interface Verdict {
  failures: { name: string; url: string }[];
  pending: string[];
}

const PASS_BUCKETS = new Set(["pass", "skipping"]);
const FAIL_BUCKETS = new Set(["fail", "cancel"]);
const PASS_STATES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAIL_STATES = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STALE",
  "STARTUP_FAILURE",
]);

/** Which checks block a merge: a failing bucket/state is a failure, anything else is pending. */
export function checkVerdict(checks: readonly GhCheck[]): Verdict {
  const verdict: Verdict = { failures: [], pending: [] };
  for (const check of checks) {
    const bucket = check.bucket;
    const failed =
      (bucket !== undefined && FAIL_BUCKETS.has(bucket)) ||
      (bucket === undefined && FAIL_STATES.has(check.state));
    const passed = bucket !== undefined ? PASS_BUCKETS.has(bucket) : PASS_STATES.has(check.state);
    if (failed) verdict.failures.push({ name: check.name, url: check.link ?? "" });
    else if (!passed) verdict.pending.push(check.name);
  }
  return verdict;
}

export function formatFailures(failures: readonly { name: string; url: string }[]): string[] {
  return failures.map((failure) => `  ${failure.name} ${failure.url}`.trimEnd());
}

/** A branch is landable when it is not `main` and has nothing uncommitted. */
export function landRefusal(branch: string, dirty: string, base: string): string | null {
  if (branch === "main" || branch === base) return `refusing to land ${branch}: land a task branch into ${base}, never ${branch} itself.`;
  if (dirty.trim().length > 0) return "refusing to land a dirty tree: commit or stash first.";
  return null;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export interface LandLock {
  branch: string;
  pid: number;
  startedAt: number;
}

/** A lock nobody refreshed for this long is broken even if its pid still answers. */
export const LOCK_STALE_MS = 30 * 60_000;
/** How often a waiting landing looks again, and how long an unreadable lock is given to appear. */
export const LOCK_POLL_MS = 500;
const LOCK_UNREADABLE_GRACE_MS = 5_000;

/** The one lock file for a repo, in its git directory so every worktree shares it. */
export function lockPath(gitCommonDir: string): string {
  return join(gitCommonDir, "land.lock");
}

export function parseLock(text: string): LandLock | null {
  try {
    const parsed = JSON.parse(text) as Partial<LandLock>;
    const { branch, pid, startedAt } = parsed;
    if (typeof branch !== "string" || typeof pid !== "number" || typeof startedAt !== "number") return null;
    return { branch, pid, startedAt };
  } catch {
    return null;
  }
}

export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Why the lock at `path` can be taken anyway, or null while its holder is still landing. */
export function staleReason(
  lock: LandLock | null,
  mtimeMs: number,
  now: number,
  alive: (pid: number) => boolean,
): string | null {
  if (lock === null) {
    return now - mtimeMs >= LOCK_UNREADABLE_GRACE_MS ? "unreadable lock file" : null;
  }
  if (!alive(lock.pid)) return `pid ${lock.pid} is gone`;
  if (now - lock.startedAt >= LOCK_STALE_MS) return `older than ${LOCK_STALE_MS / 60_000} minutes`;
  return null;
}

export interface LockOptions {
  path: string;
  branch: string;
  pid?: number;
  now?: () => number;
  alive?: (pid: number) => boolean;
  wait?: (ms: number) => void;
  log?: (line: string) => void;
}

/**
 * Wait for the repo's landing lock, then hold it until the returned release runs.
 * A holder that died, or that has held the lock past 30 minutes, is broken with a warning.
 */
export function acquireLock(options: LockOptions): () => void {
  const { path, branch } = options;
  const pid = options.pid ?? process.pid;
  const now = options.now ?? Date.now;
  const alive = options.alive ?? pidIsAlive;
  const wait = options.wait ?? sleep;
  const log = options.log ?? ((line: string) => console.log(`land: ${line}`));
  const startedAt = now();
  let announced: string | null = null;
  let waitedSince: number | null = null;

  const release = (): void => {
    const held = readLockFile(path);
    if (held !== null && held.pid !== pid) {
      log(`lock at ${path} is held by pid ${held.pid}; leaving it alone`);
      return;
    }
    rmSync(path, { force: true });
  };

  for (;;) {
    try {
      writeFileSync(path, `${JSON.stringify({ branch, pid, startedAt })}\n`, { flag: "wx" });
      if (waitedSince !== null) log(`lock acquired after waiting ${Math.round((now() - waitedSince) / 1000)}s`);
      return release;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const held = readLockFile(path);
    const mtimeMs = modifiedAt(path, now());
    const reason = staleReason(held, mtimeMs, now(), alive);
    if (reason !== null) {
      const who = held === null ? "the lock" : `${held.branch} (pid ${held.pid})`;
      log(`breaking a stale lock from ${who}: ${reason}`);
      breakStale(path, pid);
      continue;
    }

    waitedSince ??= now();
    const holder = held === null ? "an unreadable lock" : `${held.branch} (pid ${held.pid})`;
    const key = `${held?.pid ?? "unreadable"}:${held?.branch ?? ""}`;
    if (key !== announced) {
      log(`waiting on ${holder} to finish landing`);
      announced = key;
    } else if (now() - waitedSince > LOCK_STALE_MS / 4 && now() - waitedSince < LOCK_STALE_MS / 4 + LOCK_POLL_MS) {
      log(`still waiting on ${holder}`);
    }
    wait(LOCK_POLL_MS);
  }
}

function readLockFile(path: string): LandLock | null {
  try {
    return parseLock(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function modifiedAt(path: string, fallback: number): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return fallback;
  }
}

/** Rename before unlinking, so two waiters breaking one stale lock cannot both win. */
function breakStale(path: string, pid: number): void {
  const tombstone = `${path}.${pid}.stale`;
  try {
    renameSync(path, tombstone);
  } catch {
    return;
  }
  rmSync(tombstone, { force: true });
}

/** Run `body` holding the repo's landing lock, and release it on every path out, thrown errors included. */
export function landLocked(options: LockOptions, body: () => number): number {
  const release = acquireLock(options);
  try {
    return body();
  } finally {
    release();
  }
}

/** The git directory every worktree of this repo shares, or the checkout's own when git says nothing. */
export function gitCommonDir(git: Git): string {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common.status === 0 && common.stdout.trim().length > 0) {
    const dir = common.stdout.trim();
    return isAbsolute(dir) ? dir : resolve(root, dir);
  }
  const plain = git(["rev-parse", "--git-common-dir"]);
  return resolve(root, plain.stdout.trim() || ".git");
}

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], timeout?: number): Run {
  return runAt(root, command, args, timeout);
}

export function runAt(cwd: string, command: string, args: string[], timeout?: number): Run {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...(timeout === undefined ? {} : { timeout }),
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gh(args: string[]): Run {
  return run("gh", args);
}

function git(args: string[], timeout?: number): Run {
  return runAt(root, "git", args, timeout);
}

/** Any git command in one checkout; the land test binds this to a throwaway remote. */
export type Git = (args: string[]) => Run;

/**
 * The only force land is allowed: after its own push and rebase, with a lease on the branch it
 * pushed. The lease makes the push fail if anyone else moved that branch in between.
 */
export function forcePushArgs(branch: string): string[] {
  return ["push", `--force-with-lease=${branch}`, "origin", `HEAD:${branch}`];
}

export interface SyncResult {
  rebased: boolean;
  /** Why the branch cannot be pushed and rewritten, or null. */
  refusal: string | null;
}

/**
 * Push the branch, rebase it onto `origin/<base>`, and push it again when the rebase moved it.
 * Land owns a branch only once its own push succeeds; a branch that already exists on the remote
 * with commits this checkout lacks is refused rather than overwritten.
 */
export function syncOntoBase(options: { branch: string; base: string; git: Git }): SyncResult {
  const { branch, base, git: runGit } = options;

  const pushed = runGit(["push", "-u", "origin", "HEAD"]);
  if (pushed.status !== 0) {
    return {
      rebased: false,
      refusal:
        `push failed, and land refuses to force-push a branch it did not push: ${details(pushed)}\n` +
        `   Push it once yourself (git push -u origin ${branch}), or start the branch from origin/${base}.`,
    };
  }

  const fetched = runGit(["fetch", "--no-tags", "origin", base]);
  if (fetched.status !== 0) return { rebased: false, refusal: `fetch origin ${base} failed: ${details(fetched)}` };

  const behind = runGit(["rev-list", "--count", `HEAD..origin/${base}`]);
  const count = Number(behind.stdout.trim());
  if (behind.status !== 0 || !Number.isFinite(count)) {
    return { rebased: false, refusal: `could not count commits behind origin/${base}: ${details(behind)}` };
  }
  if (count === 0) return { rebased: false, refusal: null };

  const rebased = runGit(["rebase", `origin/${base}`]);
  if (rebased.status !== 0) {
    runGit(["rebase", "--abort"]);
    return {
      rebased: false,
      refusal: `rebase onto origin/${base} hit a conflict: ${details(rebased)}\n   Resolve it, push, and run land again.`,
    };
  }

  const forced = runGit(forcePushArgs(branch));
  if (forced.status !== 0) {
    return { rebased: true, refusal: `push after the rebase failed: ${details(forced)}` };
  }
  return { rebased: true, refusal: null };
}

function details(result: Run): string {
  return (result.stderr || result.stdout).trim();
}

function readChecks(number: number): { checks: GhCheck[]; error?: string } {
  const result = gh(["pr", "checks", String(number), "--json", "name,state,bucket,link"]);
  if (result.status !== 0) {
    const text = details(result);
    if (/no checks reported/i.test(text)) return { checks: [] };
    return { checks: [], error: text };
  }
  try {
    return { checks: JSON.parse(result.stdout) as GhCheck[] };
  } catch (error) {
    return { checks: [], error: `unreadable gh pr checks output: ${String(error)}` };
  }
}

function waitForChecks(number: number): GhCheck[] | null {
  const deadline = Date.now() + CHECKS_APPEAR_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { checks, error } = readChecks(number);
    if (error !== undefined) {
      console.error(`land: ${error}`);
      return null;
    }
    if (checks.length > 0) return checks;
    sleep(POLL_INTERVAL_MS);
  }
  return null;
}

function verify(command: string): boolean {
  console.log(`land: verify ${command}`);
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { cwd: root, stdio: "inherit" })
      : spawnSync("bash", ["-lc", command], { cwd: root, stdio: "inherit" });
  return (result.status ?? 1) === 0;
}

function openOrReusePr(args: LandArgs, branch: string, summary: string): { number: number; url: string } | null {
  const listed = gh(["pr", "list", "--head", branch, "--base", args.base, "--state", "open", "--json", "number,url"]);
  if (listed.status !== 0) {
    console.error(`land: gh pr list failed: ${details(listed)}`);
    return null;
  }
  const open = JSON.parse(listed.stdout || "[]") as { number: number; url: string }[];
  const existing = open[0];
  if (existing !== undefined) {
    console.log(`land: reusing PR #${existing.number} ${existing.url}`);
    return existing;
  }

  const fragment = readNewestFragment(branch);
  const bodyFile = args.bodyFile === undefined ? null : readFileSync(args.bodyFile, "utf8");
  const body = chooseBody({ fragment: fragment?.text, bodyFile, summary });
  const created = gh([
    "pr",
    "create",
    "--base",
    args.base,
    "--head",
    branch,
    "--title",
    args.title ?? summary,
    "--body",
    body,
  ]);
  if (created.status !== 0) {
    console.error(`land: gh pr create failed: ${details(created)}`);
    return null;
  }
  const url = created.stdout.trim().split("\n").pop() ?? "";
  const number = Number(url.split("/").pop());
  if (!Number.isFinite(number)) {
    console.error(`land: could not read a PR number from ${url}`);
    return null;
  }
  console.log(`land: opened PR #${number} ${url}`);
  return { number, url };
}

function reportChecks(result: "failed" | "timed out", checks: GhCheck[]): number {
  const verdict = checkVerdict(checks);
  const blocking =
    verdict.failures.length > 0
      ? verdict.failures
      : checks
          .filter((check) => verdict.pending.includes(check.name))
          .map((check) => ({ name: check.name, url: check.link ?? "" }));
  console.error(`land: checks ${result}`);
  for (const line of formatFailures(blocking)) console.error(line);
  return EXIT_CHECKS_FAILED;
}

function watchChecks(number: number): number {
  const appeared = waitForChecks(number);
  if (appeared === null) {
    console.error("land: no checks appeared within 5 minutes");
    return EXIT_CHECKS_FAILED;
  }
  console.log(`land: watching ${appeared.length} check(s)`);
  const watched = run("gh", ["pr", "checks", String(number), "--watch", "--interval", "20"], WATCH_TIMEOUT_MS);
  const { checks } = readChecks(number);
  const verdict = checkVerdict(checks);
  if (verdict.failures.length > 0) return reportChecks("failed", checks);
  if (watched.status !== 0 && verdict.pending.length > 0) return reportChecks("timed out", checks);
  if (verdict.pending.length > 0) return reportChecks("timed out", checks);
  console.log(`land: ${checks.length} check(s) green`);
  return EXIT_LANDED;
}

function merge(number: number): number {
  const armed = gh(["pr", "merge", String(number), "--auto", "--merge"]);
  if (armed.status !== 0) {
    const { checks } = readChecks(number);
    if (checkVerdict(checks).failures.length > 0) return reportChecks("failed", checks);
    console.log(`land: auto-merge unavailable (${details(armed)}); merging directly`);
    const direct = gh(["pr", "merge", String(number), "--merge"]);
    if (direct.status !== 0) {
      console.error(`land: could not merge: ${details(direct)}`);
      return EXIT_COULD_NOT_MERGE;
    }
  }
  return waitForMerged(number);
}

function waitForMerged(number: number): number {
  const deadline = Date.now() + MERGED_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const view = gh(["pr", "view", String(number), "--json", "state,url"]);
    if (view.status !== 0) {
      console.error(`land: gh pr view failed: ${details(view)}`);
      return EXIT_COULD_NOT_MERGE;
    }
    const pr = JSON.parse(view.stdout) as { state: string; url: string };
    if (pr.state === "MERGED") {
      console.log(`landed ${pr.url}`);
      return EXIT_LANDED;
    }
    if (pr.state === "CLOSED") {
      console.error(`land: PR #${number} closed without merging`);
      return EXIT_COULD_NOT_MERGE;
    }
    sleep(POLL_INTERVAL_MS);
  }
  console.error(`land: PR #${number} did not reach MERGED within ${MERGED_TIMEOUT_MS / 60_000} minutes`);
  return EXIT_COULD_NOT_MERGE;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const refusal = landRefusal(branch, git(["status", "--porcelain"]).stdout, args.base);
  if (refusal !== null) {
    console.error(`land: ${refusal}`);
    process.exit(EXIT_COULD_NOT_MERGE);
  }

  const code = landLocked({ path: lockPath(gitCommonDir(git)), branch }, () => land(args, branch));
  process.exit(code);
}

/** Everything after the lock is held: push, rebase, PR, verify, checks, merge. */
function land(args: LandArgs, branch: string): number {
  const sync = syncOntoBase({ branch, base: args.base, git: (gitArgs) => git(gitArgs, 120_000) });
  if (sync.refusal !== null) {
    console.error(`land: ${sync.refusal}`);
    return EXIT_COULD_NOT_MERGE;
  }
  console.log(`land: pushed ${branch}${sync.rebased ? ` and rebased it onto origin/${args.base}` : ""}`);

  const summary = git(["log", "-1", "--format=%s"]).stdout.trim() || branch;
  const pr = openOrReusePr(args, branch, summary);
  if (pr === null) return EXIT_COULD_NOT_MERGE;

  if (args.verify !== undefined && !verify(args.verify)) {
    console.error(`land: verify failed: ${args.verify}`);
    return EXIT_VERIFY_FAILED;
  }

  const watched = watchChecks(pr.number);
  if (watched !== EXIT_LANDED) return watched;

  return merge(pr.number);
}

if (import.meta.main) main();
