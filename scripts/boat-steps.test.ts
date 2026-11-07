import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DONE_MARK, OUTPUT_TAIL, parseFileLine, parseResultLine, parseStartLine, reportPath, resultLine, type RemotePlan } from "./boat-steps";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("the runner reports each step as it settles, a failure with its output, and blocks what needed it", () => {
  const dir = mkdtempSync(join(tmpdir(), "boat-steps-"));
  made.push(dir);
  const bun = process.execPath;
  const plan: RemotePlan = {
    jobs: 2,
    failFast: true,
    steps: [
      { name: "passes", command: [bun, "-e", "console.log('fine')"], first: true },
      { name: "fails", command: [bun, "-e", "console.error('expect(received).toBe(expected)'); process.exit(1)"], first: true },
      { name: "after fails", command: [bun, "-e", "0"], needs: ["fails"] },
    ],
  };
  writeFileSync(join(dir, "steps.json"), JSON.stringify(plan));
  const run = Bun.spawnSync([bun, join(import.meta.dir, "boat-steps.ts"), join(dir, "steps.json")], { cwd: dir });
  const lines = run.stdout.toString().split("\n");
  expect(run.exitCode).toBe(1);
  const results = lines.map(parseResultLine).filter((result) => result !== null);
  expect(results.map((result) => [result.name, result.ok])).toEqual(expect.arrayContaining([["passes", true], ["fails", false], ["after fails", false]]));
  expect(results.find((result) => result.name === "passes")?.output).toBe("");
  expect(results.find((result) => result.name === "fails")?.output).toContain("expect(received)");
  expect(results.find((result) => result.name === "after fails")?.blockedBy).toEqual(["fails"]);
  expect(lines.map(parseStartLine).filter((name) => name !== null).sort()).toEqual(["fails", "passes"]);
  expect(lines).toContain(`${DONE_MARK} false`);
});

test("the suite reports a run rewrote come back, and the ones it left alone do not", () => {
  const dir = mkdtempSync(join(tmpdir(), "boat-steps-"));
  made.push(dir);
  for (const game of ["rewritten", "untouched"]) {
    mkdirSync(join(dir, "games", game, "proofs"), { recursive: true });
    writeFileSync(join(dir, "games", game, "proofs", "suite-report.json"), "old");
  }
  const bun = process.execPath;
  const plan: RemotePlan = {
    jobs: 1,
    failFast: true,
    steps: [{ name: "suite", command: [bun, "-e", "require('fs').writeFileSync('games/rewritten/proofs/suite-report.json', 'new')"], first: true }],
  };
  writeFileSync(join(dir, "steps.json"), JSON.stringify(plan));
  const run = Bun.spawnSync([bun, join(import.meta.dir, "boat-steps.ts"), join(dir, "steps.json")], { cwd: dir });
  expect(run.exitCode).toBe(0);
  const files = run.stdout.toString().split("\n").map(parseFileLine).filter((file) => file !== null);
  expect(files).toEqual([{ path: "games/rewritten/proofs/suite-report.json", text: "new" }]);
  expect(parseFileLine("ordinary output")).toBeNull();
});

test("a runaway failure log is cut to its tail, so one line cannot swamp the run", () => {
  const line = resultLine({ name: "x", ok: false, ms: 1, output: "a".repeat(OUTPUT_TAIL + 50) + "LAST" });
  const parsed = parseResultLine(line)!;
  expect(parsed.output.startsWith("[... 54 characters cut]")).toBe(true);
  expect(parsed.output.endsWith("LAST")).toBe(true);
  expect(parseResultLine("ordinary output")).toBeNull();
  expect(parseResultLine("some text @@boat-step {}")).toBeNull();
});

test("a test step's junit report path is read from its command", () => {
  expect(reportPath(["bun", "test", "--reporter=junit", "--reporter-outfile=.scratch/r/tests-1.xml", "a.test.ts"])).toBe(".scratch/r/tests-1.xml");
  expect(reportPath(["bun", "scripts/check-layers.ts"])).toBeNull();
});
