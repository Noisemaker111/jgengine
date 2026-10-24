/**
 * Create a ready git worktree for parallel agent work, local or cloud.
 *
 *   bun run agent:worktree -- <name> [branch]
 *
 * Path: <main checkout>/.claude/worktrees/<name> (gitignored), even when run from
 * inside another worktree. Branch: agent/<name> or the second argument, from origin/beta.
 *
 * Ready means: dependencies linked from the main checkout when bun.lock matches
 * (otherwise `bun install --frozen-lockfile`), `Games` and the dev runner's
 * gitignored public assets linked, and a clean `git status`. No build is needed:
 * tests and type-checks resolve `@jgengine/*` to source (scripts/sourcePaths.ts).
 *
 * `claude --worktree` and a bare `git worktree add` skip all of that, so
 * `ensureWorktreeReady` is the same repair path exposed to any tree through
 * `bun run ensure-ready` (which every test/build/smoke script runs).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { gamesCheckout, gamesCheckoutLine } from "./games-scope";

export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Workspace roots whose per-package node_modules hold the isolated linker's symlinks. */
const WORKSPACE_GROUPS = ["packages", "apps", "examples"];

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
  if (!existsSync(join(mainRoot, "node_modules", ".bin", "tsgo"))) return false;
  try {
    return readFileSync(join(mainRoot, "bun.lock"), "utf8") === readFileSync(join(target, "bun.lock"), "utf8");
  } catch {
    return false;
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
 * Gitignored content the dev runner reads from the main checkout: the cloned
 * `Games` tree and pulled-in public assets (e.g. apps/dev/public/models/<pack>).
 * A worktree shares the main checkout's single Games clone, so its commit is
 * reported too: every game gate reads that one tree (#2217, #2228).
 * `ignored` is `git ls-files --others --ignored --exclude-standard --directory` output.
 */
export function assetLinks(mainRoot: string, ignored: string[]): string[] {
  const links = existsSync(join(mainRoot, "Games")) ? ["Games"] : [];
  for (const line of ignored) {
    const rel = line.replace(/\/$/, "");
    if (/^apps\/dev\/public\/.+/.test(rel)) links.push(rel);
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
};

function gitIgnored(mainRoot: string): string[] {
  const result = Bun.spawnSync(
    ["git", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "apps"],
    { cwd: mainRoot, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  if (result.exitCode !== 0) return [];
  return (result.stdout?.toString() ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function installed(target: string): boolean {
  return (
    existsSync(join(target, "node_modules", ".bin", "tsgo")) ||
    existsSync(join(target, "node_modules", ".bin", "tsgo.exe"))
  );
}

/**
 * Make any tree usable: dependencies (linked from the main checkout when the
 * locks match, else installed) plus the `Games` and dev-runner asset links.
 *
 * Idempotent and cheap when repeated: the already-ready path costs a few
 * `existsSync` calls and no process spawn, so `ensure-ready` can call this on
 * every test run. Returns null when `cwd` is the main checkout itself.
 */
export function ensureWorktreeReady(cwd: string, options: WorktreeReadyOptions = {}): WorktreeReadiness | null {
  const mainRoot = mainCheckoutRoot(cwd);
  if (mainRoot === null || realpathSync(mainRoot) === realpathSync(cwd)) return null;

  const needsDeps = !installed(cwd);
  const needsGames = existsSync(join(mainRoot, "Games")) && !existsSync(join(cwd, "Games"));
  if (!needsDeps && !needsGames) return { mainRoot, deps: [], assets: [], installed: false, unchanged: true };

  const result: WorktreeReadiness = { mainRoot, deps: [], assets: [], installed: false, unchanged: false };
  if (needsDeps) {
    if (canLinkDeps(mainRoot, cwd)) {
      result.deps = linkDeps(mainRoot, cwd);
    } else {
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
  }
  const ignored = (options.ignored ?? gitIgnored)(mainRoot);
  result.assets = linkAssets(mainRoot, cwd, assetLinks(mainRoot, ignored));
  return result;
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
    console.error(`agent-worktree: ${resolved.error}\nusage: bun run agent:worktree -- <name> [branch]`);
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
  // new lane takes the merged ones with it. Unmerged and dirty trees stay.
  const reaped = Bun.spawnSync(["bun", "run", "worktree:reap"], {
    cwd: mainRoot,
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
  console.log(
    `agent-worktree: ready in ${seconds}s — ${did.length > 0 ? did.join("; ") : "already set up (deps, Games, assets present; nothing changed)"}`,
  );

  const checkout = gamesCheckout(target);
  const gamesLine = gamesCheckoutLine("agent-worktree", checkout);
  if (checkout.state === "at-pin" || checkout.state === "override" || checkout.state === "no-pin") {
    console.log(gamesLine);
  } else {
    console.warn(`${gamesLine}\nagent-worktree: the game gates fail until the main checkout is at the pin — \`bun run games:clone\` in ${mainRoot}`);
  }
  console.log(`agent-worktree: work in ${target} on ${branch}; tests run from source, no build needed`);
}
