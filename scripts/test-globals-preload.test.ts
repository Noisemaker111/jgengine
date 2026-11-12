import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const guard = join(import.meta.dir, "test-globals-preload.ts");

/** Two test files run in order in one `bun test`, as a shard runs them; `withGuard` preloads the guard. */
function runInOrder(first: string, second: string, withGuard: boolean): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "jg-test-globals-"));
  try {
    writeFileSync(join(dir, "a.test.ts"), first);
    writeFileSync(join(dir, "b.test.ts"), second);
    const run = Bun.spawnSync(["bun", "test", ...(withGuard ? ["--preload", guard] : []), "./a.test.ts", "./b.test.ts"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    return { code: run.exitCode, output: `${run.stdout.toString()}${run.stderr.toString()}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The #3194 leak: a stub put back by assignment leaves an own `window` key holding undefined, and the
// next file stubs `window` only when the key is missing.
const LEAKS_WINDOW = `import { afterEach, test } from "bun:test";
let saved: unknown;
afterEach(() => { (globalThis as { window?: unknown }).window = saved; });
test("stubs window", () => { saved = (globalThis as { window?: unknown }).window; (globalThis as { window?: unknown }).window = { stub: true }; });
`;
const NEEDS_WINDOW = `import { beforeEach, expect, test } from "bun:test";
beforeEach(() => { if (!("window" in globalThis)) (globalThis as { window?: unknown }).window = new EventTarget(); });
test("has a window", () => { expect(typeof (globalThis as { window?: { addEventListener?: unknown } }).window?.addEventListener).toBe("function"); });
`;

test("without the guard, a file that leaves an own undefined window breaks the next file", () => {
  const run = runInOrder(LEAKS_WINDOW, NEEDS_WINDOW, false);
  expect(run.code, run.output).not.toBe(0);
});

test("the guard restores browser globals a file leaked before the next file's tests", () => {
  const run = runInOrder(LEAKS_WINDOW, NEEDS_WINDOW, true);
  expect(run.code, run.output).toBe(0);
  expect(run.output).toContain("test-globals:");
});

test("a global the next file sets for itself is kept", () => {
  const leaks = `import { test } from "bun:test";
test("leaks", () => { (globalThis as { document?: unknown }).document = { from: "a" }; });
`;
  const ownsIt = `import { expect, test } from "bun:test";
(globalThis as { document?: unknown }).document = { from: "b" };
test("keeps its own", () => { expect((globalThis as { document?: { from: string } }).document?.from).toBe("b"); });
`;
  const run = runInOrder(leaks, ownsIt, true);
  expect(run.code, run.output).toBe(0);
});
