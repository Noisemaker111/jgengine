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

  /**
   * `--look` on a `--url` target is how a lane aims a branch served by its own dev runner. The run
   * gets as far as resolving the target, so the aim was accepted rather than refused.
   */
  test("accepts --look with an external --url", () => {
    const run = spawnSync(
      process.execPath,
      [join(import.meta.dir, "shoot-dev.ts"), "demo", "--url", "http://127.0.0.1:1/", "--look", "1,2"],
      { encoding: "utf8", timeout: 60_000 },
    );
    expect(run.stderr).toContain("nothing is listening at");
    expect(run.stderr).not.toContain("needs the dev-runner game shell");
  }, 90_000);

  /** `--site` is a plain web page, so aiming it can only ever produce a plausible wrong view. */
  test("refuses --look on a --site page, naming the target that works", () => {
    const run = spawnSync(
      process.execPath,
      [join(import.meta.dir, "shoot-dev.ts"), "demo", "--site", "/pricing", "--look", "1,2"],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("--site renders a plain web page");
    expect(run.stderr).toContain("--url http://127.0.0.1:<port>/?game=<game>");
  }, 60_000);
});
