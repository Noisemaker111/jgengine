import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failedTests, movedResults } from "./test-dates";

const preload = join(import.meta.dir, "test-date-preload.ts");

/** Run `code` in a fresh bun with the date preload and `env`, and return what it printed. */
function shifted(code: string, env: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-test-date-"));
  try {
    const file = join(dir, "probe.ts");
    writeFileSync(file, code);
    const run = Bun.spawnSync(["bun", "--preload", preload, file], { env: { ...process.env, JG_TEST_DATE_OFFSET: "", ...env } });
    return run.stdout.toString().trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a shifted run reads the chosen day from Date and from the files it writes, and its clock keeps running", () => {
  const out = shifted(
    `import { statSync, writeFileSync } from "node:fs";
     const a = Date.now(); await Bun.sleep(30); const b = Date.now();
     const f = process.argv[1] + ".stamp"; writeFileSync(f, "");
     console.log(JSON.stringify({ day: new Date().toISOString().slice(0, 10), ran: b - a, file: Math.abs(statSync(f).mtimeMs - Date.now()) < 5000 }));`,
    { JG_TEST_DATE: "2031-12-31T12:00:00Z" },
  );
  const result = JSON.parse(out) as { day: string; ran: number; file: boolean };
  expect(result.day).toBe("2031-12-31");
  expect(result.ran).toBeGreaterThanOrEqual(25);
  expect(result.file).toBe(true);
});

test("unset, the preload leaves the clock alone", () => {
  const out = shifted(`console.log(Math.abs(Date.now() - (performance.timeOrigin + performance.now())) < 2000);`, { JG_TEST_DATE: "" });
  expect(out).toBe("true");
});

test("a result is moved when it failed on some days and not on others", () => {
  const output = "(pass) a [1ms]\n(fail) b [2ms]\nsrc/x.test.ts: (fail) c - Error: boom\n";
  expect([...failedTests(output)]).toEqual(["b", "src/x.test.ts: c"]);
  const runs = new Map([["d1", new Set(["b", "c"])], ["d2", new Set(["b"])]]);
  expect([...movedResults(runs)]).toEqual([["c", ["d1"]]]);
});
