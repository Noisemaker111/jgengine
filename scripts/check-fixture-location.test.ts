import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { findTempFixtureUsage, scanFixtureLocations } from "./check-fixture-location";

const SCRIPT = join(import.meta.dir, "check-fixture-location.ts");
const SCRATCH = join(import.meta.dir, "..", ".scratch");

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureTree(name: string, files: Record<string, string>, baseline?: string[]): string {
  const root = join(SCRATCH, `fixture-location-${name}-${crypto.randomUUID()}`);
  made.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  if (baseline !== undefined) {
    writeFileSync(join(root, "scripts/fixture-location-baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  }
  return root;
}

function runGate(root: string, extra: string[] = []): { code: number | null; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, SCRIPT, "--root", root, ...extra],
    cwd: root,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

const OFFENDER = `import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
export const dir = mkdtempSync(tmpdir());
`;

describe("what counts as a temp fixture", () => {
  test("names the line for tmpdir, mkdtemp, TEMP and TMPDIR", () => {
    expect(findTempFixtureUsage("const d = tmpdir();").map((hit) => hit.line)).toEqual([1]);
    expect(findTempFixtureUsage("x\nconst d = mkdtempSync(join(tmpdir(), 'a'));").length).toBeGreaterThan(0);
    expect(findTempFixtureUsage("const d = process.env.TEMP;").map((hit) => hit.token)).toEqual(["process.env.TEMP"]);
    expect(findTempFixtureUsage("const d = process.env.TMPDIR;").map((hit) => hit.token)).toEqual(["process.env.TMPDIR"]);
  });

  test("a workspace path is not a finding", () => {
    expect(findTempFixtureUsage("const d = join(import.meta.dir, '..', '.scratch', 'x');")).toEqual([]);
  });

  test("the marker exempts its own line or the line above, and needs a reason", () => {
    expect(findTempFixtureUsage("const d = tmpdir(); // fixture-location: allow plain bytes only")).toEqual([]);
    expect(
      findTempFixtureUsage("// fixture-location: allow plain bytes only\nconst d = tmpdir();"),
    ).toEqual([]);
    expect(findTempFixtureUsage("// fixture-location: allow\nconst d = tmpdir();").length).toBe(1);
  });

  test("scans test files only, one key per file, skipping this checker's own test", () => {
    const root = fixtureTree("scan", {
      "scripts/hit.test.ts": OFFENDER,
      "scripts/another.test.tsx": "const d = tmpdir();\n",
      "scripts/plain.ts": OFFENDER,
    });
    expect(scanFixtureLocations(root).map((finding) => finding.key)).toEqual([
      "scripts/another.test.tsx",
      "scripts/hit.test.ts",
    ]);
  });
});

describe("the ratchet", () => {
  test("an existing offender in the baseline passes", () => {
    const root = fixtureTree("baselined", { "scripts/old.test.ts": OFFENDER }, ["scripts/old.test.ts"]);
    const result = runGate(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 baselined, none added");
  });

  test("a new temp-fixture test fails and names the file", () => {
    const root = fixtureTree(
      "new",
      { "scripts/old.test.ts": OFFENDER, "scripts/fresh.test.ts": "const d = mkdtempSync('x');\n" },
      ["scripts/old.test.ts"],
    );
    const result = runGate(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("scripts/fresh.test.ts:1");
    expect(result.stderr).toContain(".scratch/<name>");
  });

  test("a marked file is exempt and the baseline stays empty", () => {
    const root = fixtureTree(
      "marked",
      {
        "scripts/ok.test.ts": "// fixture-location: allow the fixture is one byte on disk, no engine import\nconst d = tmpdir();\n",
      },
      [],
    );
    expect(runGate(root).code).toBe(0);
  });

  test("a baseline that grows by --write is what the gate then rejects", () => {
    const root = fixtureTree("grow", { "scripts/late.test.ts": OFFENDER }, []);
    expect(runGate(root).code).toBe(1);
    expect(runGate(root, ["--write"]).code).toBe(0);
    expect(runGate(root).code).toBe(0);
    writeFileSync(join(root, "scripts/second.test.ts"), "const d = tmpdir();\n");
    const grown = runGate(root);
    expect(grown.code).toBe(1);
    expect(grown.stderr).toContain("scripts/second.test.ts");
  });

  test("fixing a baselined file fails until the smaller baseline is committed", () => {
    const root = fixtureTree("shrink", { "scripts/fixed.test.ts": "const d = 'ok';\n" }, ["scripts/fixed.test.ts"]);
    const result = runGate(root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no longer apply");
    expect(result.stderr).toContain("--write");
  });
});
