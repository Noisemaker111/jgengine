import { expect, test } from "bun:test";
import { parseArgs, runBatch } from "./repeat-tests";

test("requires targeted tests and positive whole-number limits", () => {
  expect(() => parseArgs([])).toThrow();
  expect(() => parseArgs(["--runs", "1.5", "--", "x.test.ts"])).toThrow();
  expect(() => parseArgs(["--workers", "0", "--", "x.test.ts"])).toThrow();
  expect(parseArgs(["--runs", "3", "--workers", "2", "--", "x.test.ts"]).testArgs).toEqual(["x.test.ts"]);
});

test("keeps every result and output, including failures and timeouts", async () => {
  const config = { runs: 3, workers: 2, timeoutMs: 5_000 };
  const good = await runBatch([process.execPath, "-e", "console.log('evidence')"], config);
  expect(good.map((r) => r.run)).toEqual([1, 2, 3]);
  expect(good.every((r) => r.exitCode === 0 && r.stdout.includes("evidence"))).toBe(true);
  const bad = await runBatch([process.execPath, "-e", "console.error('failure evidence'); process.exit(7)"], config);
  expect(bad.every((r) => r.exitCode === 7 && r.stderr.includes("failure evidence"))).toBe(true);
  const timeout = await runBatch([process.execPath, "-e", "setInterval(() => {}, 1000)"], { runs: 1, workers: 1, timeoutMs: 100 });
  expect(timeout[0]?.exitCode).not.toBe(0);
}, 15_000);
