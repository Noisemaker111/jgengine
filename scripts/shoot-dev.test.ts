import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/**
 * shoot's command line: `--cold` is engine-only (the portable harness has no daemon to skip), so it
 * is filtered before the shared flag parser and must still be accepted rather than reported unknown.
 */
describe("shoot CLI", () => {
  test("accepts --cold and documents the warm default", () => {
    const run = spawnSync(process.execPath, [join(import.meta.dir, "shoot-dev.ts"), "demo", "--cold", "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect({ status: run.status, stderr: run.stderr.slice(0, 300) }).toEqual({ status: 0, stderr: "" });
    expect(run.stdout).toContain("--cold");
    expect(run.stdout).toContain("warm: reused");
  }, 60_000);

  test("still refuses an unknown option", () => {
    const run = spawnSync(process.execPath, [join(import.meta.dir, "shoot-dev.ts"), "demo", "--bogus"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("unknown option --bogus");
  }, 60_000);
});
