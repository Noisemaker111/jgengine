import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildSpawn, tokenizeCommand } from "./guard.ts";

const guard = join(import.meta.dir, "guard.ts");

// A JSON payload with the exact hazards that broke the old win32 `shellQuote`
// round-trip: embedded double quotes and spaces inside string values.
const JSON_ARG = '{"foo":"bar baz","q":"a\\"b"}';

describe("buildSpawn", () => {
  test("win32 passes JSON pass-through args verbatim as argv, no requoting", () => {
    const plan = buildSpawn("win32", "bun scripts/drive-dev.ts", ["--rpc", JSON_ARG]);
    // Spawns the program directly (shell:false) — no cmd.exe command-string round-trip.
    expect(plan.file).toBe("bun");
    expect(plan.options.shell).toBe(false);
    // The JSON arrives untouched: identical string, no doubled quotes, not split.
    expect(plan.args).toEqual(["scripts/drive-dev.ts", "--rpc", JSON_ARG]);
    const rpcIndex = plan.args.indexOf("--rpc");
    expect(plan.args[rpcIndex + 1]).toBe(JSON_ARG);
    expect(plan.args).not.toContain('{"foo":""bar'); // no `"` -> `""` doubling
  }, 30_000);

  test("win32 with no pass-through args runs the command through cmd.exe", () => {
    const plan = buildSpawn("win32", "bun run a && bun run b", []);
    expect(plan.file).toBe("cmd.exe");
    // Compound command preserved as a single argv element so cmd interprets `&&`.
    expect(plan.args).toEqual(["/d", "/s", "/c", "bun run a && bun run b"]);
    expect(plan.options.shell).toBe(false);
  }, 30_000);

  test("posix path is unchanged: sh -c with \"$@\" carries args verbatim", () => {
    const plan = buildSpawn("linux", "bun scripts/drive-dev.ts", ["--rpc", JSON_ARG]);
    expect(plan.file).toBe("sh");
    expect(plan.args).toEqual(["-c", 'bun scripts/drive-dev.ts "$@"', "guard", "--rpc", JSON_ARG]);
    expect(plan.options.detached).toBe(true);
    // The JSON is a discrete argv word handed to `"$@"`, never reserialized.
    expect(plan.args[plan.args.length - 1]).toBe(JSON_ARG);
  }, 30_000);

  test("posix compound command keeps identical sh -c shape", () => {
    const plan = buildSpawn("darwin", "bun run a && bun run b", []);
    expect(plan.file).toBe("sh");
    expect(plan.args).toEqual(["-c", 'bun run a && bun run b "$@"', "guard"]);
  }, 30_000);

  test("tokenizeCommand splits a single program command on whitespace", () => {
    expect(tokenizeCommand("bun scripts/drive-dev.ts")).toEqual(["bun", "scripts/drive-dev.ts"]);
  });
});

// The guard and the bun it wraps run below normal priority (scripts/machine-priority.ts), so on a
// PC saturated by normal-priority work Windows gives them a slice about every 4-5 s; these tests
// check what the guard does, not how fast a starved process does it, so each gets 30 s.
describe("guard", () => {
  test("passes through a successful command's exit code", () => {
    const result = Bun.spawnSync(["bun", guard, "30", "bun", "-e", "process.exit(0)"], { timeout: 60_000 });
    expect(result.exitCode).toBe(0);
  }, 30_000);

  test("passes through a failing command's exit code", () => {
    const result = Bun.spawnSync(["bun", guard, "30", "bun", "-e", "process.exit(3)"], { timeout: 60_000 });
    expect(result.exitCode).toBe(3);
  }, 30_000);

  test("forwards extra argv to the wrapped command", () => {
    // bun -e scripts do not put the source in process.argv; trailing args start at argv[1].
    const result = Bun.spawnSync([
      "bun",
      guard,
      "30",
      "bun",
      "-e",
      "process.stdout.write(process.argv[1] ?? '')",
      "hello",
    ], { timeout: 60_000 });
    expect(result.stdout.toString()).toBe("hello");
  }, 30_000);

  test("forwards a JSON arg with quotes and spaces intact (POSIX end-to-end)", () => {
    const result = Bun.spawnSync([
      "bun",
      guard,
      "30",
      "bun",
      "-e",
      "process.stdout.write(process.argv[1] ?? '')",
      JSON_ARG,
    ], { timeout: 60_000 });
    expect(result.stdout.toString()).toBe(JSON_ARG);
  }, 30_000);

  test("rejects a missing or invalid budget", () => {
    const result = Bun.spawnSync(["bun", guard, "nope", "bun", "-e", "process.exit(0)"], { timeout: 60_000 });
    expect(result.exitCode).toBe(2);
  }, 30_000);

  test("kills a hung command tree and exits 124", () => {
    const started = performance.now();
    const result = Bun.spawnSync(["bun", guard, "1", "bun", "-e", "await Bun.sleep(30_000)"], { timeout: 60_000 });
    expect(result.exitCode).toBe(124);
    // The 1 s budget plus the kill; the rest is starvation headroom (see the describe's note).
    expect(performance.now() - started).toBeLessThan(20_000);
  }, 30_000);
});
