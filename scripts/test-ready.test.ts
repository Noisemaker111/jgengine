import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const script = join(import.meta.dir, "test-ready.ts");
const scratch = join(import.meta.dir, "..", ".scratch");

function write(path: string, body = ""): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

function run(cwd: string): { code: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, script], { cwd, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

describe("the bun test preload", () => {
  test("is silent in the main checkout, which needs no links", () => {
    const base = join(scratch, "test-ready-main");
    rmSync(base, { recursive: true, force: true });
    try {
      write(join(base, "bun.lock"), "lock-v1");
      write(join(base, "package.json"), JSON.stringify({ workspaces: [] }));
      write(join(base, "node_modules", ".bin", "tsgo"));
      write(join(base, "apps", "dev", "node_modules", ".bin", "vite"));
      const result = run(base);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("exits 78 naming the fix when the main checkout's install is half-finished", () => {
    const base = join(scratch, "test-ready-half");
    rmSync(base, { recursive: true, force: true });
    const main = join(base, "main");
    const worktree = join(base, "wt");
    try {
      for (const root of [main, worktree]) {
        write(join(root, "bun.lock"), "lock-v1");
        write(join(root, "package.json"), JSON.stringify({ workspaces: [], dependencies: { three: "^0.1.0" } }));
      }
      write(join(main, "node_modules", ".bin", "tsgo"));
      mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
      write(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
      const result = run(worktree);
      expect(result.code).toBe(78);
      expect(result.stderr).toContain("worktree:doctor --repair");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
