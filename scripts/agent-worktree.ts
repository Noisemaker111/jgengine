/**
 * Create a ready git worktree for parallel agent work, local or cloud.
 *
 *   bun run worktree new <name> [branch]
 *
 * Path: <main checkout>/.claude/worktrees/<name> (gitignored), even when run from
 * inside another worktree. Branch: agent/<name> or the second argument, from origin/beta.
 *
 * Ready means: dependencies linked from the main checkout when bun.lock matches
 * (otherwise `bun install --frozen-lockfile`), the gitignored public assets of the
 * dev runner and the games linked, and a clean `git status`. No build is needed:
 * tests and type-checks resolve `@jgengine/*` to source (scripts/sourcePaths.ts).
 *
 * `claude --worktree` and a bare `git worktree add` skip all of that, so
 * `ensureWorktreeReady` is the same repair path exposed to any tree through
 * `bun run ensure-ready` (which every test/build/smoke script runs).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { hasInstall, missingDependencies } from "./checkout-ready";

export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Workspace roots whose per-package node_modules hold the isolated linker's symlinks. */
const WORKSPACE_GROUPS = ["packages", "apps", "examples", "games", "games/llmville/packages"];

/** Bundler caches that belong to one checkout and must not be shared. */
const SKIPPED_CACHE = /^\.vite/;

/** Where the worktree for `name` lives, or why it may not. */
export function worktreeTarget(mainRoot: string, name: string): { path: string } | { error: string } {
  if (!NAME_PATTERN.test(name)) return { error: "name: alphanumerics, dots, underscores, hyphens (max 64)" };
  const root = resolve(mainRoot, ".claude", "worktrees");
  const path = resolve(root, name);
  if (!path.startsWith(root + sep)) return { error: "refused path outside .claude/worktrees" };
  if (/^[a-z]:\\tmp\\/i.test(path)) return { error: "refused temp-drive paths (Windows Codex sandbox thrash)" };
  return { path };
}

/** Workspace-relative dirs (plus the root) whose node_modules a linked worktree needs. */
export function workspaceDirs(root: string): string[] {
  const dirs = [""];
  for (const group of WORKSPACE_GROUPS) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, "package.json"))) dirs.push(`${group}/${entry.name}`);
    }
  }
  if (existsSync(join(root, "registry", "package.json"))) dirs.push("registry");
  return dirs;
}

/** True when the worktree can reuse the main checkout's installed dependencies. */
export function canLinkDeps(mainRoot: string, target: string): boolean {
  return hasInstall(mainRoot) && locksMatch(mainRoot, target);
}

function locksMatch(mainRoot: string, target: string): boolean {
  try {
    return readFileSync(join(mainRoot, "bun.lock"), "utf8") === readFileSync(join(target, "bun.lock"), "utf8");
  } catch {
    return false;
  }
}

/**
 * Take the links back out once the worktree's lock no longer matches the store they point at, so the
 * install that follows writes this worktree's own node_modules and never the main checkout's.
 * Only the root junction and the copied workspace folders go; the store behind them is untouched.
 */
export function unlinkDeps(target: string): void {
  unlinkSync(join(target, "node_modules"));
  for (const rel of workspaceDirs(target)) {
    if (rel !== "") rmSync(join(target, rel, "node_modules"), { recursive: true, force: true });
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Link dependencies: the root node_modules is a symlink to the main checkout's
 * store; each workspace's node_modules is copied as-is because it holds only
 * relative symlinks, which then resolve to this worktree's own packages.
 */
export function linkDeps(mainRoot: string, target: string): string[] {
  const linked: string[] = [];
  for (const rel of workspaceDirs(mainRoot)) {
    const from = join(mainRoot, rel, "node_modules");
    const to = join(target, rel, "node_modules");
    if (!existsSync(from) || exists(to) || !existsSync(join(target, rel))) continue;
    if (rel === "") {
      symlinkSync(realpathSync(from), to, "junction");
    } else {
      cpSync(from, to, {
        recursive: true,
        verbatimSymlinks: true,
        filter: (src) => !SKIPPED_CACHE.test(src.slice(from.length + 1).split(/[\\/]/)[0] ?? ""),
      });
    }
    linked.push(rel === "" ? "node_modules" : `${rel}/node_modules`);
  }
  return linked;
}

/**
 * Gitignored content the main checkout pulled once: public assets under apps/dev and under each
 * game (models, materials and sprites from `assets pull`).
 * `ignored` is `git ls-files --others --ignored --exclude-standard --directory` output.
 */
export function assetLinks(mainRoot: string, ignored: string[]): string[] {
  const links: string[] = [];
  for (const line of ignored) {
    const rel = line.replace(/\/$/, "");
    if (/^(?:apps\/dev|games\/[^/]+)\/public\/.+/.test(rel)) links.push(rel);
  }
  return links;
}

export function linkAssets(mainRoot: string, target: string, links: string[]): string[] {
  const made: string[] = [];
  for (const rel of links) {
    const to = join(target, rel);
    if (existsSync(to)) continue;
    if (exists(to)) unlinkSync(to); // dangling junction from a moved main checkout
    mkdirSync(dirname(to), { recursive: true });
    symlinkSync(realpathSync(join(mainRoot, rel)), to, "junction");
    made.push(rel);
  }
  return made;
}

/**
 * Main checkout that owns `cwd`, or null when `cwd` *is* the main checkout.
 * A linked worktree has `.git` as a file pointing at `<main>/.git/worktrees/<name>`,
 * so this is one read instead of a git process on every test and build.
 */
export function mainCheckoutRoot(cwd: string): string | null {
  const dotGit = join(cwd, ".git");
  let content: string;
  try {
    if (!lstatSync(dotGit).isFile()) return null;
    content = readFileSync(dotGit, "utf8").trim();
  } catch {
    return null;
  }
  const match = /^gitdir:\s*(.+)$/m.exec(content);
  if (!match) return null;
  const gitdir = resolve(cwd, match[1]!.trim());
  const root = dirname(dirname(dirname(gitdir)));
  return existsSync(join(root, ".git")) ? root : null;
}

export interface WorktreeReadiness {
  mainRoot: string;
  /** Workspace-relative node_modules dirs linked by this call. */
  deps: string[];
  /** Workspace-relative asset links created by this call. */
  assets: string[];
  /** True when this call ran `bun install` because the locks differ. */
  installed: boolean;
  /** True when the tree already had everything: nothing was touched. */
  unchanged: boolean;
}

export type WorktreeReadyOptions = {
  /** Called when dependencies cannot be linked; must install or throw. */
  install?: (target: string) => void;
  /** Ignored-file listing used to find dev-runner assets. Defaults to `git ls-files`. */
  ignored?: (mainRoot: string) => string[];
  /** Declared packages the tree cannot resolve. Defaults to `missingDependencies`. */
  missing?: (root: string) => string[];
};

function gitIgnored(mainRoot: string): string[] {
  const result = Bun.spawnSync(
    ["git", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "apps"],
    { cwd: mainRoot, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  if (result.exitCode !== 0) return [];
  return (result.stdout?.toString() ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Make any tree usable: dependencies (linked from the main checkout when the
 * locks match, else installed) plus the pulled asset links.
 *
 * Idempotent and cheap when repeated: the already-ready path costs a few
 * `existsSync` calls and no process spawn, so `ensure-ready` can call this on
 * every test run. Returns null when `cwd` is the main checkout itself.
 */
export function ensureWorktreeReady(cwd: string, options: WorktreeReadyOptions = {}): WorktreeReadiness | null {
  const mainRoot = mainCheckoutRoot(cwd);
  if (mainRoot === null || realpathSync(mainRoot) === realpathSync(cwd)) return null;

  // A linked tree whose lock moved on (a lane that added a package) would install into the main
  // checkout's store through the link, so it gets its own install instead.
  const linked = isLink(join(cwd, "node_modules"));
  const staleLink = linked && !locksMatch(mainRoot, cwd);
  // tsgo alone said "installed" while a game's own packages were missing (a branch checked out after
  // the install, or the main checkout's older per-game folders copied in), so every declared package counts.
  const incomplete = hasInstall(cwd) && !staleLink && (options.missing ?? missingDependencies)(cwd).length > 0;
  if (hasInstall(cwd) && !staleLink && !incomplete) return { mainRoot, deps: [], assets: [], installed: false, unchanged: true };

  const result: WorktreeReadiness = { mainRoot, deps: [], assets: [], installed: false, unchanged: false };
  // A shared install that lacks a package cannot be fixed by linking it again, and installing through
  // the link would rewrite the main checkout's store, so the worktree gets its own.
  if (staleLink || (incomplete && linked)) unlinkDeps(cwd);
  if (!incomplete && canLinkDeps(mainRoot, cwd)) result.deps = linkDeps(mainRoot, cwd);
  if (result.deps.length > 0 && (options.missing ?? missingDependencies)(cwd).length > 0) {
    unlinkDeps(cwd);
    result.deps = [];
  }
  if (result.deps.length === 0) {
    (options.install ?? ((target: string) => {
      const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
        cwd: target,
        stdout: "inherit",
        stderr: "inherit",
        timeout: 600_000,
      });
      if (install.exitCode !== 0) {
        throw new Error(`bun install --frozen-lockfile failed (exit ${install.exitCode ?? 1})`);
      }
    }))(cwd);
    result.installed = true;
  }
  const ignored = (options.ignored ?? gitIgnored)(mainRoot);
  result.assets = linkAssets(mainRoot, cwd, assetLinks(mainRoot, ignored));
  return result;
}

/**
 * Link every game's referenced packs from the shared asset store (`packages/assets/src/assetStore.ts`).
 * Nothing is downloaded: a pack no checkout has pulled yet is fetched once, into the store, the first
 * time a dev server or `games:provision` needs it.
 */
export async function linkGameAssets(target: string): Promise<{ linked: number; absent: number; store: string }> {
  const { provisionGame } = await import("../games/shared/provisionAssets");
  const { assetStoreRoot } = await import("../packages/assets/src/assetStore");
  const games = join(target, "games");
  let linked = 0;
  let absent = 0;
  if (existsSync(games)) {
    for (const game of readdirSync(games)) {
      const dir = join(games, game);
      if (!existsSync(join(dir, "src")) || !existsSync(join(dir, "package.json"))) continue;
      const result = await provisionGame(dir, { download: false, log: () => {} });
      linked += result.linked.length;
      absent += result.absent.length;
    }
  }
  return { linked, absent, store: assetStoreRoot(target) };
}

function git(cwd: string, args: string[], timeoutMs = 120_000): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
  const out = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "");
  if (result.exitCode !== 0) {
    console.error(out.trim() || `git ${args.join(" ")} failed`);
    process.exit(result.exitCode ?? 1);
  }
  return result.stdout?.toString().trim() ?? "";
}

if (import.meta.main) {
  const startedAt = Date.now();
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const name = args[0] ?? "";
  const branch = args[1] ?? `agent/${name}`;

  const commonDir = git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const mainRoot = dirname(commonDir);
  const resolved = worktreeTarget(mainRoot, name);
  if ("error" in resolved) {
    console.error(`agent-worktree: ${resolved.error}\nusage: bun run worktree new <name> [branch]`);
    process.exit(1);
  }
  const target = resolved.path;

  git(mainRoot, ["fetch", "origin", "beta", "--prune"]);
  const base = git(mainRoot, ["rev-parse", "origin/beta"]);
  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    console.log(`agent-worktree: already exists at ${target} — verifying`);
  } else {
    const branchExists =
      Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: mainRoot }).exitCode === 0;
    console.log(`agent-worktree: adding ${target} on ${branch}${branchExists ? "" : ` from origin/beta (${base.slice(0, 8)})`}`);
    git(mainRoot, branchExists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target, "origin/beta"], 180_000);
  }

  // A lane that ended without `lane:close` still leaves its worktree behind, so a
  // new lane takes the merged ones with it. Unmerged and dirty trees stay. The reap
  // runs from the new tree, which is origin/beta: the main checkout can sit on any
  // branch, and its older copy of the reaper kept what the current one removes.
  const reaped = Bun.spawnSync(["bun", join(target, "scripts", "worktree-reap.ts"), "--skip", target], {
    cwd: target,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 600_000,
  });
  const reapLine = (reaped.stdout?.toString() ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .pop();
  if (reaped.exitCode === 0 && reapLine !== undefined && !reapLine.includes("no merged worktree")) {
    console.log(`agent-worktree: ${reapLine}`);
  }

  const readiness = ensureWorktreeReady(target);
  if (readiness === null) {
    console.error("agent-worktree: could not resolve the main checkout for this worktree");
    process.exit(1);
  }

  // Pulled packs come from the one shared store, never a per-worktree download.
  const assets = await linkGameAssets(target);

  const dirty = git(target, ["status", "--porcelain"]);
  if (dirty !== "") {
    console.error(`agent-worktree: new worktree is not clean — a link is not gitignored:\n${dirty}`);
    process.exit(1);
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const did: string[] = [];
  if (readiness.installed) did.push("installed dependencies (bun install --frozen-lockfile)");
  if (readiness.deps.length > 0) did.push(`linked ${readiness.deps.length} node_modules from the main checkout`);
  if (readiness.assets.length > 0) did.push(`linked ${readiness.assets.join(", ")}`);
  if (assets.linked > 0) did.push(`linked ${assets.linked} game asset pack(s) from ${assets.store}`);
  if (assets.absent > 0) did.push(`${assets.absent} pack(s) not in the store yet (a game's dev server or bun run games:provision pulls them once)`);
  console.log(
    `agent-worktree: ready in ${seconds}s — ${did.length > 0 ? did.join("; ") : "already set up (deps and assets present; nothing changed)"}`,
  );

  console.log(`agent-worktree: work in ${target} on ${branch}; tests run from source, no build needed`);
}
