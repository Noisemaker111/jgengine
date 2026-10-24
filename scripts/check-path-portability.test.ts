import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { findSeparatorAssertions, scanPathPortability } from "./check-path-portability";

const SCRIPT = join(import.meta.dir, "check-path-portability.ts");
const SCRATCH = join(import.meta.dir, "..", ".scratch");

/** The line #2301 had to fix by hand: it passes on Windows and fails on the Linux runner. */
const BEFORE = 'expect(missingFlowsMessage(dir)).toContain("proofs\\\\flows");';
/** The same assertion after the fix. */
const AFTER = 'expect(missingFlowsMessage(dir)).toContain(join("proofs", "flows"));';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(name: string, files: Record<string, string>): string {
  const root = join(SCRATCH, `path-portability-${name}-${crypto.randomUUID()}`);
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function runGate(root: string): { code: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT, "--root", root],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const FLOWS = (assertion: string): string => `import { expect, test } from "bun:test";
import { join } from "node:path";

test("a game with no flows says so", () => {
  ${assertion}
});
`;

describe("what counts as a baked-in separator", () => {
  test("the pre-fix flows line is named with its line and the join that replaces it", () => {
    const hits = findSeparatorAssertions(FLOWS(BEFORE));
    expect(hits.map((hit) => hit.rule)).toEqual(["windows-separator"]);
    expect(hits[0]!.line).toBe(5);
    expect(hits[0]!.fix).toBe('join("proofs", "flows")');
  });

  test("the fixed flows line is clean", () => {
    expect(findSeparatorAssertions(FLOWS(AFTER))).toEqual([]);
  });

  test("a bare separator comparison is an assumption, on either side", () => {
    expect(findSeparatorAssertions('expect(dir).toContain("/");').map((hit) => hit.rule)).toEqual(["bare-separator"]);
    expect(findSeparatorAssertions("expect(dir).toContain('\\\\');").map((hit) => hit.rule)).toEqual(["bare-separator"]);
  });

  test("a POSIX root handed to join, and a literal beside an OS path result, are named", () => {
    expect(findSeparatorAssertions('expect(worktreeTarget("/repo", "ui")).toEqual({ path: join("/repo", "ui") });').map((hit) => hit.rule)).toEqual([
      "posix-absolute",
    ]);
    expect(findSeparatorAssertions('expect(readlinkSync(link)).toBe("../../../core");').map((hit) => hit.rule)).toEqual(["os-path-result"]);
  });

  test("paths that stay as written are not assumptions", () => {
    const clean = [
      'expect(files).toContain("proofs/flows");',
      'expect(message).toBe("a \\\\n b");',
      'const dir = join("proofs", "flows");',
      'expect(ids).toContain("CFG/spawn\\\\.point");',
      'expect(rows.join("\\\\n")).toContain("lane/one");',
    ].join("\n");
    expect(findSeparatorAssertions(clean)).toEqual([]);
  });
});

describe("the gate over a tree", () => {
  test("fails on the pre-fix shape with the file, the line and the fix", () => {
    const root = fixture("before", { "scripts/driveFlows.test.ts": FLOWS(BEFORE) });
    const run = runGate(root);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("scripts/driveFlows.test.ts:5");
    expect(run.stderr).toContain("windows-separator");
    expect(run.stderr).toContain('join("proofs", "flows")');
  });

  test("passes on the fixed one", () => {
    const root = fixture("after", { "scripts/driveFlows.test.ts": FLOWS(AFTER) });
    const run = runGate(root);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("check-path-portability: ok");
  });

  test("an allowlisted assertion passes, prints its reason, and needs one", () => {
    const file = "scripts/lane-audit.test.ts";
    const body = 'test("win", () => {\n  expect(winPath("C:\\\\repo\\\\lane")).toBe(true);\n});\n';
    const allowed = fixture("allowed", {
      [file]: body,
      "scripts/path-portability-allow.json": JSON.stringify({
        entries: [{ file, match: "winPath(", reason: "Windows path comparison is the subject" }],
      }),
    });
    const run = runGate(allowed);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Windows path comparison is the subject");

    const unexplained = fixture("unexplained", {
      [file]: body,
      "scripts/path-portability-allow.json": JSON.stringify({ entries: [{ file, match: "winPath(", reason: " " }] }),
    });
    expect(runGate(unexplained).code).not.toBe(0);
  });

  test("an allowlist entry that no longer matches fails instead of staying as a blanket", () => {
    const root = fixture("stale", {
      "scripts/driveFlows.test.ts": FLOWS(AFTER),
      "scripts/path-portability-allow.json": JSON.stringify({
        entries: [{ file: "scripts/driveFlows.test.ts", match: "proofs", reason: "long fixed" }],
      }),
    });
    const run = runGate(root);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("stale allowlist entry");
  });

  test("this repository has no unallowlisted separator assertion", () => {
    const offenders = scanPathPortability(join(import.meta.dir, "..")).filter((finding) => finding.reason === null);
    expect(offenders.map((finding) => `${finding.file}:${finding.line} ${finding.rule}`)).toEqual([]);
  });
});
