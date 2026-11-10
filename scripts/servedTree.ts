import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): { ok: boolean; out: string; err: string } {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8", windowsHide: true, timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, out: `${result.stdout ?? ""}`.trim(), err: `${result.stderr ?? ""}`.trim() };
}

/**
 * What a tree serves, as one hash: the committed content of packages, apps and games, their uncommitted
 * diff and their untracked files. A run that sees it change measured two different programs (the dev
 * server hot-reloads saved edits), so it stops instead of printing a number for neither; a production
 * build is kept under this hash, so the same files are built once. A commit that changes no served file
 * (a script, the docs, a commit of edits already served) changes nothing here.
 */
export function treeFingerprint(dir: string): string {
  // The working files as git would commit them, through a copy of the index (its stat cache keeps this
  // to changed files), so the real index is never touched.
  const gitDir = git(dir, ["rev-parse", "--path-format=absolute", "--git-dir"]).out;
  const index = join(tmpdir(), `jg-served-tree-${process.pid}-${createHash("sha1").update(dir).digest("hex").slice(0, 8)}.index`);
  try {
    copyFileSync(join(gitDir, "index"), index);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const added = git(dir, ["add", "-A", "--", "packages", "apps", "games"], env);
    const tree = git(dir, ["write-tree"], env);
    if (!added.ok || !tree.ok) throw new Error(`git could not hash ${dir}: ${added.err || tree.err}`);
    const served = git(dir, ["rev-parse", `${tree.out}:packages`, `${tree.out}:apps`, `${tree.out}:games`]).out;
    return createHash("sha1").update(served).digest("hex").slice(0, 12);
  } finally {
    rmSync(index, { force: true });
  }
}
