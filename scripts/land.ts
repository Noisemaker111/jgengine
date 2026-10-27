// One command that hands a branch to the landing queue, so landing is not a
// hand-assembled sequence of push, open and wait:
//   bun scripts/land.ts                    # bun run lane:close runs this; call it directly only from release.ts
//   bun run lane:close                       # verify:fast, then the line below
//   bun scripts/land.ts --commit                    # stage, commit, push, open, arm
//   bun scripts/land.ts --verify "bun run check skills"
//   bun scripts/land.ts --title "Menus" --body-file .scratch/body.md
//
// `--commit` is what lets a lane end with one command: it stages this worktree's
// changes (tracked and new - ignored files such as `.scratch/` stay out), prints every
// path it will commit, and refuses the ones a lane did not author: scratch artifacts,
// a path git ignores, a lockfile staged without its `package.json` manifest, and a new
// `changes/` fragment whose name is not part of the branch's name. The commit message
// comes from that fragment, which is written from the newest commit message when the diff
// has none. `--allow <path>` keeps one refused file on purpose. Nothing to commit is not an
// error: the landing runs as it does without the flag.
//
// It refuses on `main` or (without `--commit`) a dirty tree, pushes, rebases onto the base, reuses
// an open PR or opens one (body: --body-file when given, else the `changes/`
// fragment this branch's own diff adds, else the branch's commit messages, whole),
// runs --verify, arms auto-merge and exits in seconds: it prints the PR URL and
// `bun run ci:status --pr <n>`, the one command that answers status later. It
// never polls and never sleeps.
//
// `changes/` is shared by every lane on a branch's base, so a fragment there is
// only this PR's when `git diff origin/<base>...HEAD` adds it; land names the
// ones it skips, since a body built from a stranger's note claims work the diff
// does not contain.
//
// Waiting is `bun run lane:close --queue`'s job, and only its: a branch hands off when
// land arms auto-merge (or, where the repo cannot arm it, labels the PR
// `land:queue`). The queue rebases a PR whose base moved, waits for its checks
// once, merges it and prints one line per PR with that PR's wait time and run.
// Exit codes: 0 handed to the queue, 1 verify failed, 2 checks already failed,
// 3 could not hand off (including a refused branch or dirty tree).
//
// A body given on the command line is the author's, so it wins over the
// fragment and is written over a reused PR's old body (#2200).
//
// The branch land pushed is land's to rewrite: its own rebase would otherwise
// leave the next push non-fast-forward and send the worker to a hand-typed
// force (#2120). Land force-pushes with a lease on that branch, and only after
// its own push in this run succeeded — a branch it did not push is refused.
//
// The lock covers only the moments two landings touch the same thing: the push,
// rebase and PR for a branch and a base, and the arming. When the base moved
// before the arming, land releases, rebases and arms again, at most
// MERGE_ATTEMPTS times. Every wait, and the work either side of it, is printed,
// so throughput is measured rather than guessed.
//
// The lock is one file in the repo's git directory: every worktree of the repo
// shares it (so lanes queue with each other, not just with themselves), and it
// cannot show up in `git status` to trip land's own dirty-tree check.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bendsSection, findBends, withBends } from "./bends";
import { FRAGMENT_PATTERN } from "./changelog-fragments";
import { apiNoteBullets, engineSeamLine, renderChangeNote } from "./change-note";
import { rebaseResolvingGenerated, regenerateAndCommit } from "./generated-rebase";
import { assertCheckoutReady } from "./checkout-ready";
import { printHelpIfAsked } from "./script-help";
import { isVerbose } from "./verbosity";
import { attemptsOf, judgeChecks, runIdFrom } from "./ci-status";
import type { RollupEntry } from "./ci-status";

const LAND_USAGE = {
  summary: "push this branch, open or reuse its PR, verify it and hand it to the landing queue",
  usage: "bun scripts/land.ts [-m <message> ...] [--title <title>] [--body-file <path>] [--verify <command>] [--base <branch>] [--commit] [--allow <path>]",
  flags: [
    { flag: "-m, --message <text>", detail: "with --commit: what changed, in plain words; repeatable. `Fixed: ...`, `Added: ...`, `Removed: ...`, `Migrate: ...` pick the changelog heading (default Changed). Writes changes/<branch>.md" },
    { flag: "--title <title>", detail: "PR title when land opens a PR" },
    { flag: "--body-file <path>", detail: "PR body from this file; wins over a changes/ fragment" },
    { flag: "--verify <command>", detail: "command to run before arming, e.g. \"bun run verify:fast\"" },
    { flag: "--base <branch>", detail: "branch to land into (default: beta)" },
    { flag: "--commit", detail: "stage and commit this worktree's changes first, with the changes/ fragment as the message" },
    { flag: "--allow <path>", detail: "commit a path the --commit guards refuse; repeatable" },
  ],
  example: 'bun scripts/land.ts --title "Menus" --body-file .scratch/body.md',
  exits: [
    "0 handed to the landing queue",
    "1 --verify failed",
    "2 the checks already failed",
    "3 could not hand off (refused branch, dirty tree, no PR to reuse)",
    "78 this checkout has no node_modules - run bun install, or bun run agent:bootstrap",
  ],
} as const;

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_LANDED = 0;
export const EXIT_VERIFY_FAILED = 1;
export const EXIT_CHECKS_FAILED = 2;
export const EXIT_COULD_NOT_MERGE = 3;

/** How many times one landing rebases and arms again after the base moves under it. */
export const MERGE_ATTEMPTS = 3;

/** The label that marks a PR ready for the queue when the repo cannot arm auto-merge. */
export const QUEUE_LABEL = "land:queue";

export interface LandArgs {
  title?: string;
  bodyFile?: string;
  verify?: string;
  base: string;
  /** Stage and commit this worktree's changes first, so the lane needs no git command after land. */
  commit: boolean;
  /** Paths to commit although a `--commit` guard refuses them; repeatable. */
  allow: string[];
  /** `-m`: the lane's own words for its change note; repeatable. */
  messages: string[];
}

/** `-m`, `--title`, `--body-file`, `--verify`, `--base beta`, `--commit` and `--allow <path>`; anything else is a typo. */
export function parseArgs(argv: readonly string[]): LandArgs {
  const args: LandArgs = { base: "beta", commit: false, allow: [], messages: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--title") args.title = value(argv, (i += 1), arg);
    else if (arg === "--body-file") args.bodyFile = value(argv, (i += 1), arg);
    else if (arg === "--verify") args.verify = value(argv, (i += 1), arg);
    else if (arg === "--base") args.base = value(argv, (i += 1), arg);
    else if (arg === "--commit") args.commit = true;
    else if (arg === "--allow") args.allow.push(value(argv, (i += 1), arg).replace(/\\/g, "/"));
    else if (arg === "-m" || arg === "--message") args.messages.push(value(argv, (i += 1), arg));
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

export interface FragmentFile {
  path: string;
  text: string;
  mtimeMs: number;
}

/** Every `changes/` fragment in this checkout, including other lanes' notes that share the directory. */
export function fragmentFiles(dir = join(root, "changes")): FragmentFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => FRAGMENT_PATTERN.test(`changes/${name}`)).map((name) => {
    const path = join(dir, name);
    return { path, text: readFileSync(path, "utf8"), mtimeMs: statSync(path).mtimeMs };
  });
}

/**
 * Split the fragments on disk into the ones this branch's own diff adds and the strangers'. A
 * fragment is named after nothing and shared through `changes/`, so another lane's note sits in the
 * same directory; the diff is the only thing that says which notes describe this PR.
 */
export function ownFragments(
  files: readonly FragmentFile[],
  added: readonly string[],
): { own: FragmentFile[]; ignored: FragmentFile[] } {
  const mine = new Set(
    added.filter((path) => FRAGMENT_PATTERN.test(path.trim())).map((path) => basename(path.trim())),
  );
  return {
    own: files.filter((file) => mine.has(basename(file.path))),
    ignored: files.filter((file) => !mine.has(basename(file.path))),
  };
}

/**
 * The body a branch with no fragment gets: its own commit messages, whole, never another lane's
 * note. Each subject is a bullet and its body sits under it, so a line the author wrote into a
 * commit (an engine seam, a root cause) reaches the PR.
 */
export function commitsBody(messages: readonly string[]): string {
  const clean = messages.map((message) => message.trim()).filter((message) => message.length > 0);
  if (clean.length === 0) return "";
  const bullets = clean.map((message) => {
    const [subject, ...rest] = message.split("\n");
    const body = rest.map((line) => line.trimEnd()).join("\n").trim();
    return body.length === 0 ? `- ${subject!.trim()}` : `- ${subject!.trim()}\n\n${body.replace(/^/gm, "  ")}`;
  });
  return ["Changed on this branch:", ...bullets].join("\n");
}

/** Paths this branch adds or changes against `origin/<base>`, as git reports them. */
export function diffPaths(base: string, git: Git = (args) => run("git", args)): string[] {
  const result = git(["diff", "--name-only", `origin/${base}...HEAD`]);
  return result.status === 0 ? result.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

/** Git trailers a commit carries for git, never for a reader of the note. */
const TRAILER = /^(?:co-authored-by|signed-off-by|reviewed-by|change-id):/i;

/**
 * Whole commit messages as change-note lines: each subject and each body line is one `-m` message,
 * so a body line the author wrote (`Closes #12`, a root cause) reaches the note the way `-m` would.
 */
export function noteLines(messages: readonly string[]): string[] {
  const out: string[] = [];
  for (const message of messages) {
    for (const raw of message.split("\n")) {
      const line = raw.trim().replace(/^[-*]\s+/, "");
      if (line !== "" && !TRAILER.test(line)) out.push(line);
    }
  }
  return out;
}

/** A record separator between whole messages; git writes `%x1e` as the byte, and a message never holds one. */
const MESSAGE_END = "\u001e";

/** This branch's commit messages against `origin/<base>`, subject and body, newest first. */
export function branchCommits(base: string, git: Git = (args) => run("git", args)): string[] {
  const result = git(["log", "--format=%B%x1e", `origin/${base}..HEAD`]);
  if (result.status !== 0) return [];
  return result.stdout
    .split(MESSAGE_END)
    .map((message) => message.replace(/\r\n/g, "\n").trim())
    .filter((message) => message.length > 0);
}

/** An explicit body file wins; the fragment fills in only when land was given no body. */
export function chooseBody(sources: {
  fragment?: string | null;
  bodyFile?: string | null;
  summary: string;
}): string {
  const bodyFile = sources.bodyFile?.trim() ?? "";
  if (bodyFile.length > 0) return bodyFile;
  const fragment = sources.fragment?.trim() ?? "";
  if (fragment.length > 0) return fragment;
  return sources.summary.trim();
}

export interface PrBody {
  text: string;
  /** True when the text came from `--body-file`, so land may write it over an open PR's body. */
  explicit: boolean;
  /** The "Bends" section read from the diff (`scripts/bends.ts`), "" for none; a reused PR's body gets it too. */
  bends?: string;
}

/**
 * The body for this PR: `--body-file` if land was given one, else the branch's own `changes/`
 * fragment (one its diff adds), else its commit messages, else a one-line summary. A fragment another
 * lane left in the shared directory is named and skipped, so the body never claims work the diff lacks.
 */
export function landBody(options: {
  /** `messages`: this run's `-m` lines, which rewrote the note, so a reused PR's body is rewritten too. */
  args: Pick<LandArgs, "base" | "bodyFile"> & { messages?: readonly string[] };
  branch: string;
  summary: string;
  read?: (path: string) => string;
  files?: () => readonly FragmentFile[];
  /** Paths this branch's diff against origin/<base> adds; a fragment not among them is not this PR's. */
  added?: () => readonly string[];
  /** This branch's commit messages, whole. */
  commits?: () => readonly string[];
  log?: (line: string) => void;
}): PrBody {
  const { args, branch, summary } = options;
  const read = options.read ?? ((path: string) => readFileSync(path, "utf8"));
  const log = options.log ?? (() => {});
  const bodyFile = args.bodyFile === undefined ? null : read(args.bodyFile);
  if ((bodyFile?.trim() ?? "").length > 0) return { text: chooseBody({ bodyFile, summary }), explicit: true };

  const files = (options.files ?? (() => fragmentFiles()))();
  const added = (options.added ?? (() => diffPaths(args.base)))();
  const { own, ignored } = ownFragments(files, added);
  for (const file of ignored) {
    log(`ignoring changes/${basename(file.path)}: this branch's diff against origin/${args.base} does not add it`);
  }
  const fragment = pickFragment(own, branch);
  if (fragment !== null) return { text: fragment.text.trim(), explicit: (args.messages?.length ?? 0) > 0 };

  const messages = (options.commits ?? (() => branchCommits(args.base)))();
  const commits = commitsBody(messages);
  if (commits.length > 0) {
    log(`no changes/ fragment in this branch's diff; body carries its ${messages.length} commit message(s)`);
    return { text: commits, explicit: false };
  }
  return { text: summary.trim(), explicit: false };
}

/** The commit subject a fragment gives: its first bullet, as one line. */
export function fragmentSubject(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const oneLine = trimmed.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim();
    if (oneLine.length === 0) continue;
    return oneLine.length > 100 ? `${oneLine.slice(0, 97).trimEnd()}...` : oneLine;
  }
  return "";
}

/** The fragment's bullets without its `###` headings, as a commit body. */
export function fragmentBody(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0 && !/^#{2,3}\s/.test(line.trim()))
    .join("\n")
    .trim();
}

/** The generated API surfaces (`.claude/skills/<skill>/api.md`) a diff changed. */
const API_SURFACE = /^\.claude\/skills\/[^/]+\/api\.md$/;

/** Changelog bullets for the exports this diff added and removed, read from the generated api.md files. */
export function apiChangesIn(
  changed: readonly string[],
  base: string,
  runGit: Git,
  readFile: (path: string) => string,
): { added: string[]; removed: string[] } {
  const surfaces = changed.filter((path) => API_SURFACE.test(path));
  if (surfaces.length === 0) return { added: [], removed: [] };
  const before = surfaces
    .map((path) => {
      const shown = runGit(["show", `origin/${base}:${path}`]);
      return shown.status === 0 ? shown.stdout : "";
    })
    .join("\n");
  const after = surfaces.map((path) => readFile(path)).join("\n");
  return apiNoteBullets(before, after);
}

/** What `--commit` did, so the landing can print it and a test can read it. */
export interface LaneCommitOutcome {
  kind: "committed" | "clean" | "failed";
  /** The fragment the message and the PR body come from. */
  fragment?: string;
  subject?: string;
  /** True when this run wrote the fragment because the branch's diff had none. */
  created?: boolean;
  code?: number;
  why?: string;
  /** The paths this run refused to commit, so a caller can print them all. */
  refused?: CommitGuard[];
}

/** One staged path `--commit` will not take, and the rule that stopped it. */
export interface CommitGuard {
  path: string;
  why: string;
}

const LOCKFILES = new Set(["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const MANIFESTS = new Set(["package.json"]);
/** Anything a run leaves behind rather than authors: scratch folders, edited captures, logs, temp files. */
const SCRATCH_PATH = /^(?:\.scratch(?:\/|-)|.*(?:\.out|\.log|\.tmp|\.orig|\.rej)$)|^(?:tmp|\.cache)\//;

/**
 * Paths a lane's commit must not take on its own. Every rule is stated, so a refusal is a fact to
 * read rather than a taste to argue with:
 *
 *  - scratch artifacts (`.scratch/`, `.scratch-*`, `*.out`, `*.log`, `*.tmp`, `tmp/`) are evidence,
 *    never work;
 *  - a path git ignores is not part of the repository at all;
 *  - a lockfile without its manifest is not this lane's dependency change, it is drift from the
 *    node_modules this checkout shares;
 *  - a newly added `changes/` fragment whose name is not part of the branch's name is someone
 *    else's note or a leftover a test wrote.
 *
 * `allow` names the paths the author wants anyway.
 */
export function commitGuards(options: {
  staged: readonly string[];
  added: readonly string[];
  ignored: readonly string[];
  branch: string;
  allow?: readonly string[] | undefined;
}): CommitGuard[] {
  const allowed = new Set(options.allow ?? []);
  const staged = new Set(options.staged.map(normalizePath));
  const added = new Set(options.added.map(normalizePath));
  const ignored = new Set(options.ignored.map(normalizePath));
  const branchName = options.branch.replace(/\//g, "-");
  const refusal: CommitGuard[] = [];
  for (const path of staged) {
    if (allowed.has(path)) continue;
    const name = basename(path);
    if (ignored.has(path)) refusal.push({ path, why: "git ignores this path, so it is not part of the repository" });
    else if (SCRATCH_PATH.test(path)) refusal.push({ path, why: "a run's own artifact, not authored work" });
    else if (LOCKFILES.has(name) && ![...staged].some((other) => MANIFESTS.has(basename(other)))) {
      refusal.push({ path, why: `a lockfile staged without its package.json manifest: this checkout's shared install, not this lane` });
    } else if (added.has(path) && /^changes\/.+\.md$/.test(path) && !branchName.includes(name.replace(/\.md$/, ""))) {
      refusal.push({ path, why: `a new changes/ fragment whose name is not part of ${options.branch}, so this lane did not write it` });
    }
  }
  return refusal;
}

function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

export interface CommitOptions {
  base: string;
  branch: string;
  git: Git;
  /** The checkout the git runs in; the repo root by default. */
  checkout?: string;
  /** Paths the author wants committed although a guard refuses them. */
  allow?: readonly string[];
  /** `-m` messages: the change note is written from them, over any note the branch already has. */
  messages?: readonly string[];
  /** Fragments in this checkout, `changes/` by default. */
  files?: () => readonly FragmentFile[];
  read?: (path: string) => string;
  write?: (path: string, text: string) => void;
  log?: (line: string) => void;
  /** Where the refusals go; stdout by default, so the list is read before anything is committed. */
  refuse?: (line: string) => void;
}

/**
 * Stage this worktree, print how many paths it will commit (every one under --verbose or when one is refused), refuse the ones a lane did not author, then
 * commit with the branch's change note as the message. The note is written (`scripts/change-note.ts`)
 * from the `-m` messages when there are any, else kept when the branch already has one (a lane closed
 * twice), else written from the branch's commit messages, bodies included; the written note also lists the exported
 * API the diff added or removed and, for a game change, its engine seam. So the message, the PR body
 * and `changes/` cannot disagree. Another lane's fragment in the shared directory is never used.
 */
export function commitLane(options: CommitOptions): LaneCommitOutcome {
  const { base, branch, git: runGit } = options;
  const checkout = options.checkout ?? root;
  const read = options.read ?? ((path: string) => readFileSync(path, "utf8"));
  const write = options.write ?? ((path: string, text: string) => writeFileSync(path, text));
  const log = options.log ?? (() => {});
  const refuse = options.refuse ?? log;

  const dirty = runGit(["status", "--porcelain"]);
  if (dirty.status !== 0) return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `git status failed: ${details(dirty)}` };
  const messages = (options.messages ?? []).filter((message) => message.trim().length > 0);
  // A clean tree with -m lines still rewrites the note: a re-close is how a lane rewords its PR.
  if (dirty.stdout.trim().length === 0 && messages.length === 0) return { kind: "clean" };

  const staged = runGit(["add", "-A"]);
  if (staged.status !== 0) return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `git add failed: ${details(staged)}` };

  const stagedPaths = lines(runGit(["diff", "--name-only", "--cached"])).map(normalizePath);
  const addedPaths = lines(runGit(["diff", "--name-status", "--cached", "--diff-filter=A"]))
    .map((line) => normalizePath(line.split("\t").slice(-1)[0] ?? ""))
    .filter(Boolean);
  const ignoredPaths = stagedPaths.length === 0 ? [] : lines(runGit(["check-ignore", "--", ...stagedPaths]));
  const blocked = commitGuards({
    staged: stagedPaths,
    added: addedPaths,
    ignored: ignoredPaths,
    branch,
    allow: options.allow,
  });

  // Every path is listed when one is refused, or under --verbose; a clean commit prints its count.
  const listPaths = blocked.length > 0 || isVerbose();
  log(`committing ${stagedPaths.length} file(s)${listPaths ? ":" : ""}`);
  if (listPaths) for (const path of stagedPaths) log(`  ${blocked.some((entry) => entry.path === path) ? "refused" : "commit "} ${path}`);
  if (blocked.length > 0) {
    for (const entry of blocked) refuse(`land: refusing ${entry.path}: ${entry.why}`);
    refuse("land: nothing was committed; the files above are staged. Unstage one with");
    refuse("land:   git restore --staged <path>");
    refuse("land: or keep it on purpose with: bun run lane:close --allow <path>");
    return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `refused ${blocked.length} file(s) this lane did not author`, refused: blocked };
  }

  // The branch's own commits, newest first and never HEAD: on a lane with no commit yet HEAD is the
  // base's merge commit, and its subject would become this lane's message, PR title and changelog line.
  const commits = branchCommits(base, runGit);
  const summary = firstLine(commits[0] ?? "");
  const changed = [...new Set([...diffPaths(base, runGit), ...stagedPaths].map(normalizePath))];
  const candidates = new Set(changed.map((path) => basename(path)));
  const files = options.files ?? (() => fragmentFiles());
  const own = files().filter((file) => candidates.has(basename(file.path)));
  let fragment = messages.length > 0 ? null : pickFragment(own, branch);
  let created = false;

  if (fragment === null && messages.length === 0 && commits.length === 0) {
    refuse('land: this branch has no commit and no -m message; close again with -m "<what changed, in plain words>"');
    return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: "no -m message and no commit of this branch to write the change note from" };
  }

  if (fragment === null) {
    const path = join(checkout, "changes", `${branch.replace(/\//g, "-")}.md`);
    // The whole message, not just its subject: a body line the author wrote (a root cause, an
    // engine seam) is the note, and dropping it is how a required line went missing from PRs.
    const text = renderChangeNote({
      messages: messages.length > 0 ? messages : noteLines(commits),
      api: apiChangesIn(changed, base, runGit, (file) => {
        try {
          return read(join(checkout, file));
        } catch {
          return "";
        }
      }),
      seam: engineSeamLine(changed),
    });
    if (!/^- \S/m.test(text)) {
      refuse('land: the -m messages are all PR-only lines (Closes, Prevention, Root cause); add one saying what changed, e.g. -m "Wolves hunt in packs"');
      return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: "the change note has no changelog line" };
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      write(path, text);
    } catch (error) {
      return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `could not write ${path}: ${String(error)}` };
    }
    const added = runGit(["add", "--", relative(checkout, path).replace(/\\/g, "/")]);
    if (added.status !== 0) {
      return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `git add ${path} failed: ${details(added)}` };
    }
    fragment = { path, text };
    created = true;
    log(`wrote ${basename(path)} from ${messages.length > 0 ? "the -m messages" : "the branch's commit messages"}`);
  }

  // The -m lines may say what the note already says: then there is nothing to commit.
  if (runGit(["diff", "--cached", "--quiet"]).status === 0) return { kind: "clean" };
  const subject = fragmentSubject(fragment.text) || summary;
  const body = fragmentBody(fragment.text);
  const committed = runGit(body.length > 0 ? ["commit", "-m", subject, "-m", body] : ["commit", "-m", subject]);
  if (committed.status !== 0) {
    return { kind: "failed", code: EXIT_COULD_NOT_MERGE, why: `git commit failed: ${details(committed)}` };
  }
  return {
    kind: "committed",
    fragment: relative(checkout, fragment.path).replace(/\\/g, "/"),
    subject,
    created,
  };
}

function lines(result: Run): string[] {
  return result.status === 0 ? result.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
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
  if (dirty.trim().length > 0) return "refusing to land a dirty tree: pass --commit, or commit or stash first.";
  return null;
}

/**
 * A path's refusal, or null. `--commit` cleans the tree itself, so the dirty check is only for a
 * landing that was not asked to commit.
 */
export function refusalFor(args: LandArgs, branch: string, status: string): string | null {
  return landRefusal(branch, args.commit ? "" : status, args.base);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `42s`, `2m30s`, `1h05m`: how long a landing, or a wait, took. */
export function duration(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return "<1s";
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** One queue behind another landing's lock, kept so a landing can report what it actually lost. */
export interface LockWait {
  /** The branch of the landing this one queued behind. */
  holder: string;
  waitedMs: number;
}

export function totalWait(waits: readonly LockWait[]): number {
  return waits.reduce((sum, wait) => sum + wait.waitedMs, 0);
}

/**
 * The line that makes a landing's throughput measurable: wall time split into the work it did and
 * the time it lost queueing, since only the second is contention rather than the branch's own cost.
 */
export function formatTiming(elapsedMs: number, waits: readonly LockWait[]): string {
  const waited = totalWait(waits);
  const worked = Math.max(0, elapsedMs - waited);
  const longest = waits.reduce<LockWait | null>((best, wait) => (best === null || wait.waitedMs > best.waitedMs ? wait : best), null);
  let queued = "waited 0s for the lock";
  if (longest !== null) {
    const who =
      waits.length === 1
        ? `held by ${longest.holder}`
        : `${waits.length} waits, longest ${duration(longest.waitedMs)} held by ${longest.holder}`;
    queued = `waited ${duration(waited)} for the lock (${who})`;
  }
  return `worked ${duration(worked)}, ${queued}`;
}

export interface LandLock {
  branch: string;
  pid: number;
  startedAt: number;
}

/** A lock nobody refreshed for this long is broken even if its pid still answers. */
export const LOCK_STALE_MS = 30 * 60_000;
/** How often a waiting landing looks again once it has been queueing a while. */
export const LOCK_POLL_MS = 500;
/** The first seconds of a wait poll this fast, so a short hold costs a short wait, not a whole poll. */
export const LOCK_POLL_FAST_MS = 50;
export const LOCK_FAST_WINDOW_MS = 5_000;
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

export interface HeldLock {
  release: () => void;
  /** What this acquisition queued behind, or null when it took the lock straight away. */
  wait: LockWait | null;
}

/**
 * Wait for the repo's landing lock, then hold it until `release` runs.
 * A holder that died, or that has held the lock past 30 minutes, is broken with a warning.
 */
export function acquireLock(options: LockOptions): HeldLock {
  const { path, branch } = options;
  const pid = options.pid ?? process.pid;
  const now = options.now ?? Date.now;
  const alive = options.alive ?? pidIsAlive;
  const wait = options.wait ?? sleep;
  const log = options.log ?? ((line: string) => console.log(`land: ${line}`));
  const startedAt = now();
  let announced: string | null = null;
  let waitedSince: number | null = null;
  let waitedOn: string | null = null;

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
      if (waitedSince === null) return { release, wait: null };
      const waitedMs = now() - waitedSince;
      const holder = waitedOn ?? "an unreadable lock";
      log(`waited ${duration(waitedMs)} for the lock (held by ${holder})`);
      return { release, wait: { holder, waitedMs } };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows answers EPERM while the holder's release is still deleting the file: it is the
      // same "someone has the lock" as EEXIST, and the next poll finds it gone.
      if (code !== "EEXIST" && !(code === "EPERM" && process.platform === "win32")) throw error;
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
    waitedOn ??= held === null ? "an unreadable lock" : held.branch;
    const holder = held === null ? "an unreadable lock" : `${held.branch} (pid ${held.pid})`;
    const key = `${held?.pid ?? "unreadable"}:${held?.branch ?? ""}`;
    if (key !== announced) {
      log(`waiting on ${holder} to finish landing`);
      announced = key;
    } else if (now() - waitedSince > LOCK_STALE_MS / 4 && now() - waitedSince < LOCK_STALE_MS / 4 + LOCK_POLL_MS) {
      log(`still waiting on ${holder}`);
    }
    wait(now() - waitedSince < LOCK_FAST_WINDOW_MS ? LOCK_POLL_FAST_MS : LOCK_POLL_MS);
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

/**
 * Run `body` holding the repo's landing lock, and release it on every path out, thrown errors
 * included. The wait it cost is appended to `waits` so the landing can report it.
 */
export function landLocked<T>(options: LockOptions, body: () => T, waits?: LockWait[]): T {
  const held = acquireLock(options);
  if (waits !== undefined && held.wait !== null) waits.push(held.wait);
  try {
    return body();
  } finally {
    held.release();
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

/**
 * Output a command may print before it is cut off. Node's default is 1 MiB, and `git show` of a
 * skill's generated api.md is already past that: cut off, the show fails and every export in the
 * file reads as newly added.
 */
const MAX_OUTPUT = 64 * 1024 * 1024;

export function runAt(cwd: string, command: string, args: string[], timeout?: number): Run {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT,
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
export function syncOntoBase(options: {
  branch: string;
  base: string;
  git: Git;
  /** Runs a generator in this checkout; a rebase that resolved generated files reruns them. */
  exec?: (command: readonly string[]) => Run;
}): SyncResult {
  const { branch, base, git: runGit } = options;
  const exec = options.exec ?? ((command: readonly string[]): Run => run(command[0]!, command.slice(1), 20 * 60_000));

  let pushed = runGit(["push", "-u", "origin", "HEAD"]);
  if (pushed.status !== 0) {
    // A remote tip this branch once held (an earlier land's push, before a rebase the lane then
    // finished) is this lane's own, so it is rewritten with a lease on exactly that tip.
    const remote = runGit(["ls-remote", "origin", `refs/heads/${branch}`]).stdout.trim().split(/\s+/)[0] ?? "";
    const held = runGit(["reflog", "show", "--format=%H", `refs/heads/${branch}`]).stdout.split("\n").map((line) => line.trim());
    if (/^[0-9a-f]{40}$/.test(remote) && held.includes(remote)) {
      pushed = runGit(["push", "-u", `--force-with-lease=${branch}:${remote}`, "origin", `HEAD:${branch}`]);
    }
  }
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

  // Generated files (api.md, the export manifest, capabilities.json) and the lane's change note
  // never stop a landing: they are resolved here and regenerated on the merged source.
  const rebased = rebaseResolvingGenerated(runGit, `origin/${base}`);
  if (!rebased.ok) {
    const files = rebased.conflicts.length > 0 ? ` in ${rebased.conflicts.join(", ")}` : "";
    return {
      rebased: false,
      refusal: `rebase onto origin/${base} hit a conflict${files}: ${rebased.detail}\n   Resolve it, push, and run land again.`,
    };
  }
  if (rebased.regenerate.length > 0) {
    const failed = regenerateAndCommit(runGit, exec);
    if (failed !== null) return { rebased: true, refusal: failed };
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

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? text.trim();
}

/** Any gh invocation in one run; the land test binds this to a scripted PR list. */
export type Gh = (args: string[]) => Run;

/** Everything a landing reaches outside itself, so the land test can drive the whole sequence. */
export interface LandIo {
  git: Git;
  gh: Gh;
  /** Runs `--verify`; true when the command passed. */
  verify: (command: string) => boolean;
  log: (line: string) => void;
  error: (line: string) => void;
}

function readChecks(runGh: Gh, number: number): { checks: GhCheck[]; error?: string } {
  const result = runGh(["pr", "view", String(number), "--json", "headRefOid,statusCheckRollup"]);
  if (result.status !== 0) return { checks: [], error: details(result) };
  let view: { headRefOid?: string; statusCheckRollup?: readonly RollupEntry[] | null };
  try {
    view = JSON.parse(result.stdout) as typeof view;
  } catch (error) {
    return { checks: [], error: `unreadable gh pr view output: ${String(error)}` };
  }
  const judged = judgeChecks(attemptsOf(view.statusCheckRollup ?? []), view.headRefOid);
  return {
    checks: judged.map((check) => ({ name: check.name, state: check.state, bucket: check.bucket, link: check.url })),
  };
}

function runVerify(command: string): boolean {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { cwd: root, stdio: "inherit" })
      : spawnSync("bash", ["-lc", command], { cwd: root, stdio: "inherit" });
  return (result.status ?? 1) === 0;
}

export interface PrRef {
  number: number;
  url: string;
}

/**
 * Replace a PR's body (or rewrite it from the current one) and, when given, its title, leaving each
 * alone when it already reads the same.
 */
export function updatePr(
  number: number,
  next: { body: string | ((current: string) => string); title?: string },
  gh: Gh,
  log = (line: string) => console.log(`land: ${line}`),
): boolean {
  const view = gh(["pr", "view", String(number), "--json", "body,title"]);
  if (view.status !== 0) {
    console.error(`land: gh pr view #${number} failed: ${details(view)}`);
    return false;
  }
  let current: { body?: string; title?: string } = {};
  try {
    current = JSON.parse(view.stdout) as { body?: string; title?: string };
  } catch (error) {
    console.error(`land: unreadable gh pr view output for #${number}: ${String(error)}`);
    return false;
  }
  const currentBody = current.body ?? "";
  const body = typeof next.body === "string" ? next.body : next.body(currentBody);
  const edit: string[] = [];
  if (currentBody.trim() !== body.trim()) edit.push("--body", body);
  if (next.title !== undefined && next.title.trim() !== "" && (current.title ?? "").trim() !== next.title.trim()) edit.push("--title", next.title);
  const changed = [edit.includes("--body") ? "body" : null, edit.includes("--title") ? "title" : null].filter((part) => part !== null).join(" and ");
  if (edit.length === 0) {
    log(`PR #${number} already reads as given`);
    return true;
  }
  const edited = gh(["pr", "edit", String(number), ...edit]);
  if (edited.status !== 0) {
    console.error(`land: could not update PR #${number} ${changed}: ${details(edited)}`);
    return false;
  }
  log(`updated PR #${number} ${changed}`);
  return true;
}

/**
 * Reuse the open PR for `branch`, or open one. A reused PR gets the body and title land was given
 * written over its old ones, so a body left from an earlier run cannot keep a check that reads it red
 * and a title cannot describe work the branch no longer is.
 */
export function ensurePr(options: {
  args: Pick<LandArgs, "base" | "title" | "bodyFile">;
  branch: string;
  summary: string;
  body: PrBody;
  gh: Gh;
  log?: (line: string) => void;
}): PrRef | null {
  const { args, branch, summary, body, gh: runGh } = options;
  const log = options.log ?? ((line: string) => console.log(`land: ${line}`));

  const listed = runGh(["pr", "list", "--head", branch, "--base", args.base, "--state", "open", "--json", "number,url"]);
  if (listed.status !== 0) {
    console.error(`land: gh pr list failed: ${details(listed)}`);
    return null;
  }
  const open = JSON.parse(listed.stdout || "[]") as PrRef[];
  const existing = open[0];
  if (existing !== undefined) {
    log(`reusing PR #${existing.number} ${existing.url}`);
    // A body land was given (`--body-file`, or `-m` lines that rewrote the note) rewrites the title too,
    // so a re-close never leaves the first run's title over the new description.
    if (body.explicit && !updatePr(existing.number, { body: body.text, title: args.title ?? summary }, runGh, log)) return null;
    // A reused PR keeps its body, but its Bends section is rewritten from the diff it now carries.
    if (!body.explicit && body.bends !== undefined && !updatePr(existing.number, { body: (current) => withBends(current, body.bends!) }, runGh, log)) {
      return null;
    }
    return existing;
  }

  const created = runGh([
    "pr",
    "create",
    "--base",
    args.base,
    "--head",
    branch,
    "--title",
    args.title ?? summary,
    "--body",
    body.text,
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
  log(`opened PR #${number} ${url}`);
  return { number, url };
}

/** The failure is a result: name every check that failed and let the run of each speak for itself. */
function reportChecks(io: LandIo, checks: readonly GhCheck[]): number {
  const verdict = checkVerdict(checks);
  io.error(`checks failed: ${verdict.failures.map((failure) => failure.name).join(", ")}`);
  for (const line of formatFailures(verdict.failures)) io.error(line);
  if (verdict.pending.length > 0) io.log(`still running: ${verdict.pending.length} more check(s): ${verdict.pending.join(", ")}`);
  return EXIT_CHECKS_FAILED;
}

/** ` (run 701)`, naming the Action runs the named checks are running on. */
function runningRunIds(checks: readonly GhCheck[], names: readonly string[]): string {
  const wanted = new Set(names);
  const runs = [
    ...new Set(
      checks
        .filter((check) => wanted.has(check.name))
        .map((check) => runIdFrom(check.link ?? ""))
        .filter((id): id is number => id !== null),
    ),
  ];
  return runs.length > 0 ? ` (run ${runs.join(", ")})` : "";
}

/**
 * What GitHub says when a merge is refused because the base moved under the PR, so land rebases
 * instead of reporting a conflict the branch may not have. A real conflict also lands here: the
 * rebase is what tells the two apart.
 */
const BASE_MOVED =
  /base branch was modified|base branch requires that the pull request is up to date|not up to date|out of date|branch is behind|merge commit cannot be cleanly created/i;

export function baseMoved(detail: string): boolean {
  return BASE_MOVED.test(detail);
}

/** Push, rebase and open or reuse the PR: the part that needs the lock, and nothing after it. */
function prepare(args: LandArgs, branch: string, io: LandIo): PrRef | number {
  const sync = syncOntoBase({ branch, base: args.base, git: io.git });
  if (sync.refusal !== null) {
    io.error(sync.refusal);
    return EXIT_COULD_NOT_MERGE;
  }
  io.log(`pushed ${branch}${sync.rebased ? ` and rebased it onto origin/${args.base}` : ""}`);

  const summary = io.git(["log", "-1", "--format=%s"]).stdout.trim() || branch;
  const body = landBody({
    args,
    branch,
    summary,
    added: () => diffPaths(args.base, io.git),
    commits: () => branchCommits(args.base, io.git),
    log: io.log,
  });
  // A PR names its bends - assertions deleted, tests skipped, checks disabled - read from the diff,
  // so a reviewer who never opens it still sees them. A clean diff adds no section.
  const diff = io.git(["diff", "--no-color", "-M", "-U0", `origin/${args.base}...HEAD`]);
  const bends = diff.status === 0 ? bendsSection(findBends(diff.stdout)) : undefined;
  if (bends !== undefined) io.log(bends === "" ? "Bends: none in the diff" : "Bends: listed in the PR body");
  const withSection = bends === undefined ? body : { ...body, text: withBends(body.text, bends), bends };
  const pr = ensurePr({ args, branch, summary, body: withSection, gh: io.gh, log: io.log });
  return pr ?? EXIT_COULD_NOT_MERGE;
}

/** What arming means for the hand-off: the queue's readiness signal, or why there is none. */
export type Arming =
  | { kind: "armed" }
  | { kind: "labelled"; why: string }
  | { kind: "retry"; why: string }
  | { kind: "failed"; code: number };

/**
 * Hand the PR to the queue: arm auto-merge, which is what the queue reads as ready. A repo that
 * refuses to arm gets the `land:queue` label instead, and the queue merges that PR directly.
 */
function armForQueue(io: LandIo, number: number): Arming {
  const { checks } = readChecks(io.gh, number);
  const verdict = checkVerdict(checks);
  if (verdict.failures.length > 0) return { kind: "failed", code: reportChecks(io, checks) };
  if (verdict.pending.length > 0) {
    const on = runningRunIds(checks, verdict.pending);
    io.log(`checks still running: ${verdict.pending.length} of ${checks.length}${on}; auto-merge waits for them`);
  }
  const armed = io.gh(["pr", "merge", String(number), "--auto", "--merge"]);
  if (armed.status === 0) return { kind: "armed" };
  const why = details(armed);
  if (baseMoved(why)) return { kind: "retry", why };
  const labelled = io.gh(["pr", "edit", String(number), "--add-label", QUEUE_LABEL]);
  if (labelled.status === 0) return { kind: "labelled", why: firstLine(why) };
  io.error(`could not arm auto-merge (${firstLine(why)}) or add the ${QUEUE_LABEL} label (${details(labelled)})`);
  return { kind: "failed", code: EXIT_COULD_NOT_MERGE };
}

/** What an author reads instead of a wait: the PR, how to ask later, and who waits now. */
export function handOffLines(pr: PrRef): string[] {
  return [
    pr.url,
    `status: bun run ci:status --pr ${pr.number}`,
    "waiting: bun run lane:close --queue (the queue owns the wait; this command is done)",
  ];
}

export interface LandRun {
  args: LandArgs;
  branch: string;
  /** The repo's landing lock file. */
  lock: string;
  io: LandIo;
  /** Where `--commit` reads and writes fragments; the checkout's `changes/` by default. */
  commitIo?: Pick<CommitOptions, "files" | "read" | "write">;
  /** Waits on the lock are appended here, so the caller can print what the landing spent queueing. */
  waits?: LockWait[];
}

/**
 * Land `branch`: push it, open or reuse its PR, arm auto-merge and return. The lock is held only
 * around the shared moments: the push and PR, and the arming.
 */
export function landBranch(run: LandRun): number {
  const waits = run.waits ?? [];
  const startedAt = Date.now();
  try {
    if (run.args.commit) {
      const committed = commitLane({
        base: run.args.base,
        branch: run.branch,
        git: run.io.git,
        log: run.io.log,
        refuse: run.io.error,
        allow: run.args.allow,
        messages: run.args.messages,
        ...run.commitIo,
      });
      if (committed.kind === "failed") {
        run.io.error(`land: ${committed.why}`);
        return committed.code ?? EXIT_COULD_NOT_MERGE;
      }
      run.io.log(
        committed.kind === "committed"
          ? `committed ${committed.subject} (${committed.fragment})`
          : "nothing to commit; landing what the branch already has",
      );
    }
    return handOff(run, waits);
  } finally {
    run.io.log(formatTiming(Date.now() - startedAt, waits));
  }
}

/** Push, open, verify, arm: everything the author owes, and none of the waiting. */
function handOff(run: LandRun, waits: LockWait[]): number {
  const { args, branch, io } = run;
  const prepared = landLocked({ path: run.lock, branch, log: io.log }, () => prepare(args, branch, io), waits);
  if (typeof prepared === "number") return prepared;

  if (args.verify !== undefined) {
    io.log(`verify ${args.verify}`);
    if (!io.verify(args.verify)) {
      io.error(`verify failed: ${args.verify}`);
      return EXIT_VERIFY_FAILED;
    }
  }

  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
    const armed = landLocked({ path: run.lock, branch, log: io.log }, () => armForQueue(io, prepared.number), waits);
    if (armed.kind === "failed") return armed.code;
    if (armed.kind === "retry") {
      if (attempt === MERGE_ATTEMPTS) {
        io.error(`could not hand #${prepared.number} over after ${MERGE_ATTEMPTS} attempts: ${firstLine(armed.why)}`);
        return EXIT_COULD_NOT_MERGE;
      }
      io.log(
        `origin/${args.base} moved before the hand-off (${firstLine(armed.why)}); ` +
          `rebasing (attempt ${attempt + 1} of ${MERGE_ATTEMPTS})`,
      );
      const synced = landLocked(
        { path: run.lock, branch, log: io.log },
        () => syncOntoBase({ branch, base: args.base, git: io.git }),
        waits,
      );
      if (synced.refusal !== null) {
        io.error(synced.refusal);
        return EXIT_COULD_NOT_MERGE;
      }
      continue;
    }
    if (armed.kind === "labelled") io.log(`auto-merge unavailable (${armed.why}); labelled the PR ${QUEUE_LABEL}`);
    for (const line of handOffLines(prepared)) io.log(line);
    return EXIT_LANDED;
  }
  return EXIT_COULD_NOT_MERGE;
}

function main(): void {
  if (printHelpIfAsked("land", LAND_USAGE)) process.exit(EXIT_LANDED);
  assertCheckoutReady("land", root);
  const args = parseArgs(process.argv.slice(2));

  if (args.bodyFile !== undefined && !existsSync(args.bodyFile)) {
    console.error(`land: --body-file ${args.bodyFile} does not exist`);
    process.exit(EXIT_COULD_NOT_MERGE);
  }

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const refusal = refusalFor(args, branch, args.commit ? "" : git(["status", "--porcelain"]).stdout);
  if (refusal !== null) {
    console.error(`land: ${refusal}`);
    process.exit(EXIT_COULD_NOT_MERGE);
  }

  const code = landBranch({
    args,
    branch,
    lock: lockPath(gitCommonDir(git)),
    io: {
      git: (gitArgs) => git(gitArgs, 120_000),
      gh,
      verify: runVerify,
      log: (line) => console.log(`land: ${line}`),
      error: (line) => console.error(`land: ${line}`),
    },
  });
  process.exit(code);
}

if (import.meta.main) main();
