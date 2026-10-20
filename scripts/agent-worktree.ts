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
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

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
    if (exists(to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    symlinkSync(realpathSync(join(mainRoot, rel)), to, "junction");
    made.push(rel);
  }
  return made;
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
    console.log(`agent-worktree: already exists at ${target} — relinking`);
  } else {
    const branchExists =
      Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: mainRoot }).exitCode === 0;
    console.log(`agent-worktree: adding ${target} on ${branch}${branchExists ? "" : ` from origin/beta (${base.slice(0, 8)})`}`);
    git(mainRoot, branchExists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target, "origin/beta"], 180_000);
  }

  if (canLinkDeps(mainRoot, target)) {
    const linked = linkDeps(mainRoot, target);
    console.log(`agent-worktree: linked ${linked.length} node_modules from ${mainRoot}`);
  } else {
    console.log("agent-worktree: bun.lock differs from the main checkout (or it has no install) — installing");
    const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
      cwd: target,
      stdout: "inherit",
      stderr: "inherit",
      timeout: 600_000,
    });
    if (install.exitCode !== 0) {
      console.error("agent-worktree: bun install failed — fix, then `cd` there and re-run bun run agent:bootstrap");
      process.exit(install.exitCode ?? 1);
    }
  }

  const ignored = git(mainRoot, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "apps"])
    .split("\n")
    .filter(Boolean);
  const assets = linkAssets(mainRoot, target, assetLinks(mainRoot, ignored));
  if (assets.length > 0) console.log(`agent-worktree: linked ${assets.join(", ")}`);

  const dirty = git(target, ["status", "--porcelain"]);
  if (dirty !== "") {
    console.error(`agent-worktree: new worktree is not clean — a link is not gitignored:\n${dirty}`);
    process.exit(1);
  }

  console.log(`
agent-worktree: ready
  path:   ${target}
  branch: ${branch}

Tests and type-checks run from source with no build. Work with cwd = that path;
do not create another worktree from inside it.
`);
}
