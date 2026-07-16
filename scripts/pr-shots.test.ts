import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

describe("pr-shots", () => {
  test("--dry does not move HEAD", () => {
    const beforeSym = (() => {
      try {
        return git(["symbolic-ref", "-q", "HEAD"]);
      } catch {
        return null;
      }
    })();
    const beforeRev = git(["rev-parse", "HEAD"]);

    const dir = mkdtempSync(join(tmpdir(), "pr-shots-test-"));
    const png = join(dir, "probe.png");
    // Minimal valid-enough bytes for --dry (never hashed into git).
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    execFileSync("bun", ["run", join(import.meta.dir, "pr-shots.ts"), "--dry", png], {
      encoding: "utf8",
      cwd: join(import.meta.dir, ".."),
    });

    const afterSym = (() => {
      try {
        return git(["symbolic-ref", "-q", "HEAD"]);
      } catch {
        return null;
      }
    })();
    const afterRev = git(["rev-parse", "HEAD"]);
    expect(afterRev).toBe(beforeRev);
    expect(afterSym).toBe(beforeSym);
  });

  test("absolute-git-dir is a real path string", () => {
    const abs = git(["rev-parse", "--absolute-git-dir"]);
    expect(abs.length).toBeGreaterThan(3);
    // On Windows may be C:\...; on Unix /...
    expect(abs.includes("git") || abs.endsWith(".git") || abs.includes("worktrees")).toBe(true);
  });
});
