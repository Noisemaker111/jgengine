import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";

const cli = resolve(import.meta.dir, "index.ts");
const scratch = resolve(import.meta.dir, "../../../../.scratch/editor-dispatch");

describe("editor CLI dispatch", () => {
  for (const [args, status] of [
    [["--help"], 0], [["-h"], 0], [["--unknown"], 1], [["--port"], 1],
    [["--port", "70000"], 1], [["--pm", "invalid"], 1], [["one", "two"], 1],
  ] as const) {
    test(`${args.join(" ")} exits without creating a workspace`, () => {
      mkdirSync(scratch, { recursive: true });
      const target = mkdtempSync(join(scratch, "case-"));
      const workspace = join(target, "editor-workspace");
      const result = spawnSync(process.execPath, [cli, "editor", "--out", workspace, ...args], {
        cwd: target, encoding: "utf8", timeout: 10_000,
      });
      expect(result.status).toBe(status);
      expect(result.stdout + result.stderr).toContain("usage: jgengine editor");
      expect(existsSync(workspace)).toBe(false);
    });
  }
});
