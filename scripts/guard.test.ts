import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const guard = join(import.meta.dir, "guard.ts");

describe("guard", () => {
  test("passes through a successful command's exit code", () => {
    const result = Bun.spawnSync(["bun", guard, "30", "exit 0"]);
    expect(result.exitCode).toBe(0);
  });

  test("passes through a failing command's exit code", () => {
    const result = Bun.spawnSync(["bun", guard, "30", "exit 3"]);
    expect(result.exitCode).toBe(3);
  });

  test("forwards extra argv to the wrapped command", () => {
    const result = Bun.spawnSync(["bun", guard, "30", "printf %s", "hello"]);
    expect(result.stdout.toString()).toBe("hello");
  });

  test("rejects a missing or invalid budget", () => {
    const result = Bun.spawnSync(["bun", guard, "nope", "exit 0"]);
    expect(result.exitCode).toBe(2);
  });

  test("kills a hung command tree and exits 124", () => {
    const started = performance.now();
    const result = Bun.spawnSync(["bun", guard, "1", "sleep 30"]);
    expect(result.exitCode).toBe(124);
    expect(performance.now() - started).toBeLessThan(10_000);
  });
});
