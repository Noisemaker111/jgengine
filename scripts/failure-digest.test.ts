import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { digestLines, failureDigest, writeStepLog } from "./failure-digest";

describe("failureDigest", () => {
  test("names each failing test file with its first error", () => {
    const output = [
      "scripts/a.test.ts:",
      "(pass) fine [1.00ms]",
      "error: expect(received).toBe(expected)",
      "Expected: 2",
      "(fail) adds numbers [0.20ms]",
      "(fail) second failure in the same file [0.10ms]",
      "",
      "packages\\core\\src\\b.test.ts:",
      "\u001b[31m(fail)\u001b[0m loads [3.00ms]",
      " 290 fail",
    ].join("\n");
    expect(failureDigest(output)).toEqual([
      { where: "scripts/a.test.ts", first: "(fail) adds numbers - error: expect(received).toBe(expected)" },
      { where: "packages/core/src/b.test.ts", first: "(fail) loads" },
    ]);
  });

  test("names each file a type-check failed with its first error, in both tsc formats", () => {
    const output = [
      "src/game.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/game.ts(40,1): error TS2304: Cannot find name 'x'.",
      "packages/core/src/a.ts:3:7 - error TS2551: Property 'foo' does not exist.",
    ].join("\n");
    expect(failureDigest(output)).toEqual([
      { where: "src/game.ts:12", first: "TS2322: Type 'string' is not assignable to type 'number'." },
      { where: "packages/core/src/a.ts:3", first: "TS2551: Property 'foo' does not exist." },
    ]);
  });

  test("an unknown tool still gets its first failure line", () => {
    expect(failureDigest("checking 40 files\nscripts/export-manifest.json is stale\nrun bun run gen")).toEqual([
      { where: "(output)", first: "scripts/export-manifest.json is stale" },
    ]);
  });
});

test("digestLines prints the files, caps the list and names the UTF-8 log", () => {
  const output = Array.from({ length: 5 }, (_, i) => `f${i}.ts(1,1): error TS1: bad ${i}`).join("\n");
  const lines = digestLines(output, "/tmp/x.log", 3);
  expect(lines[0]).toBe("  5 failing file(s):");
  expect(lines).toContain("    f0.ts:1: TS1: bad 0");
  expect(lines).toContain("    +2 more in the log");
  expect(lines.at(-1)).toBe("  full log (UTF-8): /tmp/x.log");
});

test("writeStepLog keeps non-ASCII output as UTF-8 and strips colour codes", () => {
  const root = join(import.meta.dir, "..");
  const path = writeStepLog(root, "failure-digest-test", "test 3 file(s)", "\u001b[31m✗ café — 失败\u001b[0m");
  try {
    expect(readFileSync(path, "utf8")).toBe("✗ café — 失败");
  } finally {
    rmSync(join(root, ".scratch", "failure-digest-test"), { recursive: true, force: true });
  }
});
