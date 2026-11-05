import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { buildFingerprint, buildNeeded, FINGERPRINT_PATH } from "./build-fingerprint";

function repo(): { dir: string; write: (path: string, text: string) => void; git: (...args: string[]) => void; record: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "build-fingerprint-"));
  const git = (...args: string[]): void => {
    const result = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const record = (): void => write(FINGERPRINT_PATH, buildFingerprint(dir));
  git("init", "-q");
  write(".gitignore", "dist/\n.scratch/\n");
  write("packages/core/tsconfig.build.json", "{}");
  write("packages/core/src/a.ts", "export const a = 1;\n");
  write("packages/core/dist/a.js", "export const a = 1;\n");
  write("package.json", "{}");
  git("add", "-A");
  git("commit", "-qm", "base");
  return { dir, write, git, record };
}

describe("build fingerprint", () => {
  test("a checkout with no finished build builds", () => {
    const { dir } = repo();
    expect(buildNeeded(dir)).toContain("no finished build");
    rmSync(dir, { recursive: true, force: true });
  });

  test("the tree the last build read skips the build; an edit, a new file or a deletion builds", () => {
    const { dir, write, git, record } = repo();
    record();
    expect(buildNeeded(dir)).toBeNull();

    write("packages/core/src/a.ts", "export const a = 2;\n");
    expect(buildNeeded(dir)).toContain("packages/core/src/a.ts");
    git("checkout", "--", "packages/core/src/a.ts");
    expect(buildNeeded(dir)).toBeNull();

    write("packages/core/src/b.ts", "export const b = 1;\n");
    expect(buildNeeded(dir)).toContain("packages/core/src/b.ts");
    rmSync(join(dir, "packages/core/src/b.ts"));

    rmSync(join(dir, "packages/core/src/a.ts"));
    expect(buildNeeded(dir)).toContain("packages/core/src/a.ts");
    git("checkout", "--", "packages/core/src/a.ts");

    write("package.json", '{"name":"x"}');
    expect(buildNeeded(dir)).toContain("package.json");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a committed change builds even when the working tree is clean, and a missing dist builds", () => {
    const { dir, write, git, record } = repo();
    record();
    write("packages/core/src/a.ts", "export const a = 3;\n");
    git("commit", "-qam", "change");
    expect(buildNeeded(dir)).toContain("packages/core/src/a.ts");
    record();
    rmSync(join(dir, "packages/core/dist"), { recursive: true });
    expect(buildNeeded(dir)).toContain("no dist in core");
    rmSync(dir, { recursive: true, force: true });
  });
});
