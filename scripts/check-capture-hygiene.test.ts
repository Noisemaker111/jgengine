import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Assembled rather than spelled out: this file sits inside the scan that looks for the launch call.
const HEADLESS_LAUNCH = ["chromium", "launch"].join(".") + "({ headless: true })";
const HEADED_LAUNCH = ["chromium", "launch"].join(".") + "({ headless: false })";

function run(args: string[]): { status: number | null; output: string } {
  const done = spawnSync("bun", ["scripts/check-capture-hygiene.ts", ...args], { cwd: root, encoding: "utf8", timeout: 120_000 });
  return { status: done.status, output: `${done.stdout}${done.stderr}` };
}

function withSource(source: string, check: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "capture-hygiene-"));
  const file = join(dir, "sample.ts");
  writeFileSync(file, source);
  try {
    check(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The script scans the tree when it loads, so this drives it as a process rather than importing it.
 * `Bun.Glob` has no `ignore` option, so the file list is exactly what the globs return; the default
 * scan below is what proves it still finds the launch sites after that dead option was dropped.
 */
test("the default scan reads the tree and every launch site it finds is headless", () => {
  const { status, output } = run([]);
  expect(status).toBe(0);
  const match = /check-capture-hygiene: (\d+) launch\(es\) in (\d+) file\(s\), all headless/.exec(output);
  expect(match).not.toBeNull();
  expect(Number(match?.[1])).toBeGreaterThan(0);
  expect(Number(match?.[2])).toBeGreaterThan(0);
});

test("an explicit path is what gets read, and a headless launch passes it", () => {
  withSource(`${HEADLESS_LAUNCH};\n`, (file) => {
    const { status, output } = run([file]);
    expect(status).toBe(0);
    expect(output).toContain("1 launch(es) in 1 file(s), all headless");
  });
});

test("a launch without headless: true is named by line and fails the run", () => {
  withSource(`${HEADED_LAUNCH};\n`, (file) => {
    const { status, output } = run([file]);
    expect(status).toBe(1);
    expect(output).toContain("1 headed launch(es) in 1 file(s)");
    expect(output).toContain(":1: chromium.launch without headless: true");
  });
});
