// The exact state a landing verifies, packed for a boat machine as a real git checkout.
//
// `boat run --push .` copied files without `.git`, so every stage that asks git (`git ls-files`,
// a diff against the base, build stamps) failed there: 7 of 25 `bun run check` stages on
// 2026-11-07. This writes a directory holding only:
//
//   repo.pack   the commits from the merge base to HEAD, the trees of both ends, and, when the
//               working tree has changes, one more commit on top holding them. Like a shallow
//               clone: the merge base's parents are cut off, so a 2 GB history ships as ~300 MB.
//   setup.sh    turns the pack into `repo/`: HEAD at that commit on the lane's branch name, and
//               `origin/beta` at the merge base, so `git diff origin/beta...HEAD` names the same
//               files it names here. Then the pinned bun and `bun install --frozen-lockfile`.
//
// Nothing else is pushed: no node_modules, no `.env`, nothing from the home folder. Untracked files
// count (a lane checks its work before committing it), except names that look like secrets, which
// stay here and are reported.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Untracked names never copied to a boat machine, whatever .gitignore says. */
export const SECRET_NAME = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|\.npmrc|\.netrc|\.pypirc|id_(rsa|ed25519|ecdsa|dsa)(\.pub)?|[^/]*\.(pem|key|p12|pfx|keystore|jks)|credentials[^/]*\.json|[^/]*secrets?\.(json|ya?ml|env|txt|toml))$/i;

/** Marker lines setup.sh prints, read by the caller to tell setup from the steps. */
export const READY_MARK = "@@boat-ready";
export const SETUP_FAILED_MARK = "@@boat-setup-failed";

export interface Snapshot {
  /** The directory to push: repo.pack, setup.sh and whatever the caller adds. */
  dir: string;
  /** The commit the machine checks out: HEAD, or a commit on top of it holding the working tree. */
  commit: string;
  /** This checkout's HEAD. */
  head: string;
  /** The merge base with the base ref, which the machine calls `origin/beta`. */
  base: string;
  branch: string;
  /** Untracked files left out because their names look like secrets. */
  leftOut: string[];
  packBytes: number;
  ms: number;
}

function git(root: string, args: readonly string[], options: { env?: Record<string, string>; input?: string } = {}): string {
  const run = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...(options.input === undefined ? {} : { input: options.input }),
    env: { ...process.env, ...options.env },
  });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${(run.stderr ?? "").trim()}`);
  return run.stdout ?? "";
}

const lines = (text: string): string[] => text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);

/**
 * The tree id of the working tree as it stands, tracked changes and untracked files alike (ignored
 * files and names that look like secrets left out), and those left-out names. The branch, the index
 * and the files are untouched: a private index, seeded from the real one so only changed files are
 * hashed, builds it. Two checks that see the same id saw the same bytes.
 */
export function workingTree(root: string): { tree: string; leftOut: string[] } {
  const untracked = lines(git(root, ["ls-files", "--others", "--exclude-standard"]));
  const leftOut = untracked.filter((path) => SECRET_NAME.test(path));
  const dirty = lines(git(root, ["status", "--porcelain=v1", "--untracked-files=all"])).length > 0;
  if (!dirty) return { tree: git(root, ["rev-parse", "HEAD^{tree}"]).trim(), leftOut };
  const scratch = mkdtempSync(join(tmpdir(), "boat-index-"));
  try {
    const index = join(scratch, "index");
    const realIndex = git(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]).trim();
    try {
      copyFileSync(realIndex, index);
    } catch {
      // No index yet: the private one starts empty and every file is hashed once.
    }
    const env = { GIT_INDEX_FILE: index };
    git(root, ["add", "-A"], { env });
    if (leftOut.length > 0) git(root, ["rm", "-q", "--cached", "--ignore-unmatch", "--", ...leftOut], { env });
    return { tree: git(root, ["write-tree"], { env }).trim(), leftOut };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The commit holding the working tree as it stands on top of HEAD; HEAD itself when nothing changed. */
export function workingCommit(root: string): { commit: string; leftOut: string[] } {
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const { tree, leftOut } = workingTree(root);
  if (tree === git(root, ["rev-parse", "HEAD^{tree}"]).trim()) return { commit: head, leftOut };
  const commit = git(root, ["commit-tree", tree, "-p", head, "-m", "boat: the working tree as verified"], {
    env: { GIT_AUTHOR_NAME: "verify", GIT_AUTHOR_EMAIL: "verify@localhost", GIT_COMMITTER_NAME: "verify", GIT_COMMITTER_EMAIL: "verify@localhost" },
  }).trim();
  return { commit, leftOut };
}

/**
 * The object list for a shallow pack of `commit`: every commit from `base` to it with what they
 * add, and the whole tree of each boundary commit (the merge base, and the fork point of any other
 * branch merged in), whose parents the machine treats as cut off.
 */
export function shallowObjects(root: string, commit: string, base: string): { objects: string; shallow: string[] } {
  const boundary = lines(git(root, ["rev-list", "--boundary", commit, "--not", base]))
    .filter((line) => line.startsWith("-"))
    .map((line) => line.slice(1));
  const shallow = [...new Set([base, ...boundary])];
  const parts = [git(root, ["rev-list", "--objects", commit, "--not", ...shallow])];
  for (const cut of shallow) parts.push(git(root, ["rev-list", "--objects", "--no-walk", cut]));
  return { objects: parts.join(""), shallow };
}

/** The bun version the repository pins (`packageManager`), which the machine installs when its own differs. */
export function pinnedBun(root: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager?: string };
    return /^bun@(\d+\.\d+\.\d+)/.exec(manifest.packageManager ?? "")?.[1] ?? null;
  } catch {
    return null;
  }
}

/** A remote URL with any credentials removed. */
export function publicUrl(url: string): string {
  return url.trim().replace(/^(https?:\/\/)[^@/]+@/, "$1");
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** setup.sh: the pack becomes `repo/` at `commit`, then the pinned bun and the install. */
export function setupScript(input: { commit: string; base: string; shallow: readonly string[]; branch: string; origin: string | null; bun: string | null }): string {
  const branch = input.branch.replace(/[^A-Za-z0-9._/-]/g, "-") || "verify";
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "here=$(pwd)",
    "fail() { echo \"" + SETUP_FAILED_MARK + " $1\"; exit 70; }",
    "git init -q repo || fail 'git init'",
    "cd repo",
    "mv \"$here/repo.pack\" .git/objects/pack/pack-boat.pack",
    "git index-pack .git/objects/pack/pack-boat.pack >/dev/null || fail 'git index-pack'",
    `printf '%s\\n' ${input.shallow.map(shellQuote).join(" ")} > .git/shallow`,
    `git update-ref refs/remotes/origin/beta ${shellQuote(input.base)}`,
    `git update-ref ${shellQuote(`refs/heads/${branch}`)} ${shellQuote(input.commit)}`,
    `git symbolic-ref HEAD ${shellQuote(`refs/heads/${branch}`)}`,
    "git reset -q --hard || fail 'git checkout'",
    ...(input.origin === null ? [] : [`git remote add origin ${shellQuote(input.origin)}`]),
    ...(input.bun === null
      ? []
      : [
          `want=${shellQuote(input.bun)}`,
          "if [ \"$(bun --version 2>/dev/null || true)\" != \"$want\" ]; then",
          "  curl -fsSL https://bun.sh/install | bash -s \"bun-v$want\" >/tmp/bun-install.log 2>&1 || { tail -20 /tmp/bun-install.log; fail \"bun $want\"; }",
          "  export PATH=\"$HOME/.bun/bin:$PATH\"",
          "fi",
        ]),
    "if [ -f package.json ]; then",
    "  bun install --frozen-lockfile >/tmp/install.log 2>&1 || { tail -40 /tmp/install.log; fail 'bun install --frozen-lockfile'; }",
    "fi",
    `echo ${READY_MARK} "$(git rev-parse HEAD)"`,
    "",
  ].join("\n");
}

/** Write the push directory for `root`'s working tree against `baseRef`. */
export function writeSnapshot(root: string, baseRef: string, dir: string = mkdtempSync(join(tmpdir(), "boat-push-"))): Snapshot {
  const started = Date.now();
  mkdirSync(dir, { recursive: true });
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const base = git(root, ["merge-base", "HEAD", baseRef]).trim();
  const { commit, leftOut } = workingCommit(root);
  const { objects, shallow } = shallowObjects(root, commit, base);
  const pack = join(dir, "repo.pack");
  // --window=0 reuses the deltas the repository already has instead of searching for new ones:
  // 11 s for the 310 MB tree here against 187 s with the search, for the same size.
  const packed = spawnSync("git", ["pack-objects", "--stdout", "-q", "--window=0"], { cwd: root, input: objects, maxBuffer: 2 * 1024 * 1024 * 1024 });
  if (packed.status !== 0 || packed.stdout === null) throw new Error(`git pack-objects: ${String(packed.stderr ?? "").trim()}`);
  writeFileSync(pack, packed.stdout);
  const origin = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" });
  writeFileSync(
    join(dir, "setup.sh"),
    setupScript({ commit, base, shallow, branch, origin: origin.status === 0 ? publicUrl(origin.stdout) : null, bun: pinnedBun(root) }),
    "utf8",
  );
  return { dir, commit, head, base, branch, leftOut, packBytes: statSync(pack).size, ms: Date.now() - started };
}
