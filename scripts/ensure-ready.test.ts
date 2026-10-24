import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const script = join(import.meta.dir, "ensure-ready.ts");
const scratch = join(import.meta.dir, "..", ".scratch");

function write(path: string, body = ""): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

describe("ensure-ready in a worktree nobody linked", () => {
  test("links dependencies and Games the way agent:worktree would", () => {
    const base = join(scratch, "ensure-ready-fixture");
    rmSync(base, { recursive: true, force: true });
    const main = join(base, "main");
    const worktree = join(base, "wt");
    try {
      for (const root of [main, worktree]) {
        write(join(root, "bun.lock"), "lock-v1");
        write(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*", "apps/*"] }));
        write(join(root, "apps", "dev", "package.json"), JSON.stringify({ name: "@jgengine/dev" }));
      }
      write(join(main, "node_modules", ".bin", "tsgo")); write(join(main, "node_modules", ".bin", "tsgo.exe"));
      write(join(main, "apps", "dev", "node_modules", ".bin", "vite"));
      mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
      mkdirSync(join(main, "Games", "beacon", "src"), { recursive: true });
      write(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);

      const run = Bun.spawnSync([process.execPath, script, "--install-only"], {
        cwd: worktree,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      });
      expect(run.stderr.toString()).toBe("");
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString()).toContain("Games");
      expect(existsSync(join(worktree, "node_modules", ".bin", "tsgo"))).toBe(true);
      expect(realpathSync(join(worktree, "Games"))).toBe(realpathSync(join(main, "Games")));

      const again = Bun.spawnSync([process.execPath, script, "--install-only"], {
        cwd: worktree,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      });
      expect(again.exitCode).toBe(0);
      expect(again.stdout.toString()).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("stays quiet in the main checkout, which needs no links", () => {
    const base = join(scratch, "ensure-ready-main-fixture");
    rmSync(base, { recursive: true, force: true });
    try {
      write(join(base, "bun.lock"), "lock-v1");
      write(join(base, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
      mkdirSync(join(base, "node_modules", ".bin"), { recursive: true });
      write(join(base, "node_modules", ".bin", "tsgo")); write(join(base, "node_modules", ".bin", "tsgo.exe"));
      const run = Bun.spawnSync([process.execPath, script, "--install-only"], {
        cwd: base,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      });
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString()).toBe("");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
