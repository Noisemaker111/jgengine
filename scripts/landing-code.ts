// Landing always runs beta's current landing code, not the copy in the lane being landed.
//
// A lane's worktree holds `scripts/` as it was when the lane branched. `bun run lane:close` used to
// run that copy, so a landing fix (a rebase conflict that now resolves itself, say) reached only
// lanes made after it landed, and every older lane kept hitting the old bug. Now lane:close fetches
// beta, unpacks beta's `scripts/` once per version of that folder into `<git common dir>/jg-landing/<tree>/`,
// and re-runs itself from there. That copy carries a marker file; code running from it acts on the
// checkout it was started in (the lane), and starts land and the batch from the same copy.
//
// Only the landing code moves: preflight, verify:fast, gen and the tests are the lane's own, since
// they check the lane's code. One exception: a lane that itself changes the landing (lane-close, land,
// this file, the GitHub client) runs its own copy, so a change to how lanes land lands through itself.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The file at the top of an unpacked copy of beta's landing code. */
export const LANDING_MARKER = ".jg-landing-code";
/** The folder in the git common dir that holds one unpacked copy per beta commit. */
export const LANDING_CACHE = "jg-landing";
/**
 * An unpacked copy no run has started from for this long is removed. A run loads every module it
 * imports when it starts, so a long queue wait does not need its copy kept.
 */
const KEEP_MS = 60 * 60 * 1000;

/** The folder above `scripts/` for the module at `metaUrl`. */
function codeDir(metaUrl: string): string {
  return fileURLToPath(new URL("..", metaUrl));
}

/** Whether the module at `metaUrl` runs from an unpacked copy of beta's landing code. */
export function isLandingCopy(metaUrl: string): boolean {
  return existsSync(join(codeDir(metaUrl), LANDING_MARKER));
}

let cwdTop: string | undefined;

/**
 * The checkout a landing script acts on: the repo its file sits in, or, for an unpacked copy of beta's
 * landing code, the checkout it was started in.
 */
export function landingRoot(metaUrl: string): string {
  if (!isLandingCopy(metaUrl)) return codeDir(metaUrl);
  if (cwdTop === undefined) {
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" });
    cwdTop = top.status === 0 && top.stdout.trim().length > 0 ? resolve(top.stdout.trim()) : process.cwd();
  }
  return cwdTop;
}

/**
 * How to start the landing script `name` (`land.ts`, `land-batch.ts`): `scripts/<name>` from the
 * checkout, or by its full path from the unpacked copy the caller runs from.
 */
export function landingScript(metaUrl: string, name: string): string {
  return isLandingCopy(metaUrl) ? join(codeDir(metaUrl), "scripts", name).replace(/\\/g, "/") : `scripts/${name}`;
}

export interface GitRun {
  status: number;
  stdout: string;
  stderr: string;
}
export type LandingGit = (args: string[], env?: Record<string, string>) => GitRun;

/** Beta's landing code unpacked, or why it could not be. `note` says what was unusual but not fatal. */
export type BetaLanding = { dir: string; sha: string; note?: string } | { problem: string };

/**
 * Fetch beta and unpack the files at the top of its `scripts/` (every landing module lives there) into
 * the shared cache, once per version of that folder: beta moves many times a day, its scripts far less.
 * A failed fetch falls back to the last fetched `origin/beta` with a note: that is still beta's code,
 * and a landing that cannot reach GitHub fails at its push anyway.
 */
export function unpackBetaLanding(checkout: string, git: LandingGit, now = Date.now()): BetaLanding {
  const fetched = git(["fetch", "--no-tags", "--quiet", "origin", "beta"]);
  const note = fetched.status === 0 ? undefined : `could not fetch beta (${(fetched.stderr || fetched.stdout).trim()}); using the last fetched origin/beta`;
  const tip = git(["rev-parse", "--verify", "--quiet", "origin/beta:scripts"]);
  const sha = tip.stdout.trim();
  if (tip.status !== 0 || sha.length === 0) return { problem: "this clone has no origin/beta with a scripts/ folder to take the landing code from" };
  const common = git(["rev-parse", "--git-common-dir"]);
  if (common.status !== 0 || common.stdout.trim().length === 0) return { problem: "could not find the git common dir" };
  const commonDir = isAbsolute(common.stdout.trim()) ? common.stdout.trim() : resolve(checkout, common.stdout.trim());
  const cache = join(commonDir, LANDING_CACHE);
  const dir = join(cache, sha);
  const done = (): BetaLanding => (note === undefined ? { dir, sha } : { dir, sha, note });
  if (existsSync(join(dir, LANDING_MARKER))) {
    touch(join(dir, LANDING_MARKER), now);
    prune(cache, sha, now);
    return done();
  }

  const staging = `${dir}.${process.pid}.${now}`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const listed = git(["ls-tree", "--name-only", sha]);
    const trees = git(["ls-tree", "-d", "--name-only", sha]);
    if (listed.status !== 0 || trees.status !== 0) return { problem: `could not list beta's scripts/ (${sha}): ${(listed.stderr || trees.stderr).trim()}` };
    const folders = new Set(lines(trees.stdout));
    const files = lines(listed.stdout).filter((name) => !folders.has(name));
    // A private index, so neither the lane's index nor its working tree is touched.
    const env = { GIT_INDEX_FILE: join(staging, ".index") };
    const read = git(["read-tree", sha], env);
    if (read.status !== 0) return { problem: `could not read beta's scripts/ (${sha}): ${read.stderr.trim()}` };
    const prefix = `${join(staging, "scripts").split("\\").join("/")}/`;
    const out = git(["checkout-index", "--force", `--prefix=${prefix}`, "--", ...files], env);
    if (out.status !== 0) return { problem: `could not unpack beta's scripts/ (${sha}): ${out.stderr.trim()}` };
    rmSync(env.GIT_INDEX_FILE, { force: true });
    writeFileSync(join(staging, LANDING_MARKER), `${sha}\n`);
    try {
      renameSync(staging, dir);
    } catch (error) {
      // Another lane unpacked the same version first: its copy is identical.
      if (!existsSync(join(dir, LANDING_MARKER))) return { problem: `could not place beta's landing code at ${dir}: ${String(error)}` };
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  prune(cache, sha, now);
  return done();
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function touch(path: string, now: number): void {
  try {
    utimesSync(path, now / 1000, now / 1000);
  } catch {
    // Only the pruning reads the time; a copy pruned too early is unpacked again when next needed.
  }
}

/** Remove the copies of older versions that no run has started from for an hour. */
function prune(cache: string, keep: string, now: number): void {
  let names: string[];
  try {
    names = readdirSync(cache);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === keep) continue;
    const marker = join(cache, name, LANDING_MARKER);
    try {
      const at = existsSync(marker) ? statSync(marker).mtimeMs : statSync(join(cache, name)).mtimeMs;
      if (now - at > KEEP_MS) rmSync(join(cache, name), { recursive: true, force: true });
    } catch {
      // A copy another run is removing or using; the next landing tries again.
    }
  }
}

/** The modules that decide how a lane lands; a lane that changes one lands with its own copy. */
export const LANDING_MODULES = ["scripts/lane-close.ts", "scripts/land.ts", "scripts/landing-code.ts", "scripts/github.ts"] as const;

/**
 * Where `lane:close` should run from: null to carry on here (this already is beta's landing code, beta
 * predates running from a copy, or this lane changes the landing code itself), else the copy of beta's
 * `lane-close.ts` to hand the run to.
 */
export function betaLaneClose(
  metaUrl: string,
  checkout: string,
  git: LandingGit,
  log: (line: string) => void,
): { script: string } | { problem: string } | null {
  if (isLandingCopy(metaUrl)) return null;
  const beta = unpackBetaLanding(checkout, git);
  if ("problem" in beta) return beta;
  if (beta.note !== undefined) log(`lane:close: ${beta.note}`);
  const base = git(["merge-base", "HEAD", "origin/beta"]);
  if (base.status === 0 && base.stdout.trim().length > 0) {
    const own = git(["diff", "--name-only", base.stdout.trim(), "--", ...LANDING_MODULES]);
    const changed = lines(own.stdout);
    if (own.status === 0 && changed.length > 0) {
      log(`lane:close: this lane changes the landing code (${changed.join(", ")}), so it lands with its own copy`);
      return null;
    }
  }
  // Beta's code from before this file existed cannot run from a copy (it would act on the copy):
  // this lane's code is then the newer landing code.
  if (!existsSync(join(beta.dir, "scripts", "landing-code.ts"))) return null;
  return { script: join(beta.dir, "scripts", "lane-close.ts") };
}

/** Run `git` in `cwd`, with extra environment variables. */
export function gitIn(cwd: string): LandingGit {
  return (args, env) => {
    const ran = spawnSync("git", args, { cwd, encoding: "utf8", env: env === undefined ? process.env : { ...process.env, ...env } });
    return { status: ran.status ?? 1, stdout: ran.stdout ?? "", stderr: ran.stderr ?? "" };
  };
}
