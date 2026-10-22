// One command that lands a branch on beta, so landing is not a hand-assembled
// sequence of push, open, arm and wait:
//   bun run land
//   bun run land --verify "bun run ship:preflight"
//   bun run land --title "Menus" --body-file .scratch/body.md
//
// It refuses on `main` or a dirty tree, pushes, reuses an open PR or opens one
// (body: the newest changes/ fragment, else --body-file, else a one-line
// summary), runs --verify, watches checks for up to 25 minutes, merges and
// waits for MERGED. Exit codes: 0 landed, 1 verify failed, 2 checks failed,
// 3 could not merge (including a refused branch or dirty tree).
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
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

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], timeout?: number): Run {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...(timeout === undefined ? {} : { timeout }),
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gh(args: string[]): Run {
  return run("gh", args);
}

function git(args: string[]): Run {
  return run("git", args);
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

  const pushed = run("git", ["push", "-u", "origin", "HEAD"], 120_000);
  if (pushed.status !== 0) {
    console.error(`land: push failed: ${details(pushed)}`);
    process.exit(EXIT_COULD_NOT_MERGE);
  }
  console.log(`land: pushed ${branch}`);

  const summary = git(["log", "-1", "--format=%s"]).stdout.trim() || branch;
  const pr = openOrReusePr(args, branch, summary);
  if (pr === null) process.exit(EXIT_COULD_NOT_MERGE);

  if (args.verify !== undefined && !verify(args.verify)) {
    console.error(`land: verify failed: ${args.verify}`);
    process.exit(EXIT_VERIFY_FAILED);
  }

  const watched = watchChecks(pr.number);
  if (watched !== EXIT_LANDED) process.exit(watched);

  process.exit(merge(pr.number));
}

if (import.meta.main) main();
