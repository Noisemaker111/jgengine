import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BASELINE_REL, findModuleGlobals, ratchetResult, runGate } from "./module-globals-check";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Writes `files` (repo-relative) into a temp root; every `Games/<id>/` touched also gets the
 * `src/index.tsx` barrel that marks a folder as a game. Paths inside a game are relative to it. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "module-globals-"));
  roots.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
    const game = /^([^/]+)\/src\//.exec(rel)?.[1];
    if (game === undefined) continue;
    const barrel = join(root, game, "src/index.tsx");
    mkdirSync(join(barrel, ".."), { recursive: true });
    writeFileSync(barrel, "export {};\n");
  }
  return root;
}

/** One game called `probe` holding `source` at `src/loop.ts`. */
function probe(source: string): string {
  return tree({ "probe/src/loop.ts": source });
}

function gate(root: string, argv: string[] = []): { code: number; out: string } {
  const lines: string[] = [];
  const sink = { log: (line: string) => lines.push(line), error: (line: string) => lines.push(line) };
  const code = runGate(root, argv, sink);
  return { code, out: lines.join("\n") };
}

describe("findModuleGlobals", () => {
  test("flags module-level let, exported or not", () => {
    expect(findModuleGlobals(probe("let timer = 0;\nexport let session = null;\n")).map((f) => f.key)).toEqual([
      "probe/src/loop.ts#session",
      "probe/src/loop.ts#timer",
    ]);
  });

  test("ignores let inside a function or block", () => {
    const source = "export function tick() {\n  let local = 0;\n  return local;\n}\n";
    expect(findModuleGlobals(probe(source))).toEqual([]);
  });

  test("ignores const and test files", () => {
    const root = tree({ "probe/src/a.ts": "const fixed = 1;\n", "probe/src/b.test.ts": "let scratch = 0;\n" });
    expect(findModuleGlobals(root)).toEqual([]);
  });

  test("only looks inside a game's src tree", () => {
    expect(findModuleGlobals(tree({ "probe/scripts/tool.ts": "let n = 0;\n" }))).toEqual([]);
  });

  test("a folder without the src/index.tsx barrel is not a game", () => {
    const root = tree({ "shared/src/helper.ts": "let n = 0;\n" });
    rmSync(join(root, "shared/src/index.tsx"), { force: true });
    expect(findModuleGlobals(root)).toEqual([]);
  });

  test("scans every game in the repo, not just one", () => {
    const root = tree({ "one/src/a.ts": "let a = 0;\n", "two/src/b.ts": "let b = 0;\n" });
    expect(findModuleGlobals(root).map((f) => f.key)).toEqual(["one/src/a.ts#a", "two/src/b.ts#b"]);
  });

  test("reports a 1-indexed declaration line", () => {
    expect(findModuleGlobals(probe("// header\n\nlet timer = 0;\n"))[0]!.where).toBe("probe/src/loop.ts:3");
  });
});

describe("ratchetResult", () => {
  const live = [
    { key: "probe/src/a.ts#one", where: "probe/src/a.ts:1" },
    { key: "probe/src/b.ts#two", where: "probe/src/b.ts:2" },
  ];

  test("an unchanged baseline is clean", () => {
    expect(ratchetResult(live.map((f) => f.key), live)).toEqual({ added: [], stale: [] });
  });

  test("fixing an offender and shipping the smaller baseline is clean", () => {
    expect(ratchetResult([live[0]!.key], [live[0]!])).toEqual({ added: [], stale: [] });
  });

  test("a baseline holding a key with no code is stale — it cannot grow ahead of the code", () => {
    expect(ratchetResult([...live.map((f) => f.key), "probe/src/z.ts#sneaked"], live).stale).toEqual([
      "probe/src/z.ts#sneaked",
    ]);
  });
});

describe("runGate", () => {
  test("passes on a tree that matches its baseline", () => {
    const root = probe("let timer = 0;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), '["probe/src/loop.ts#timer"]\n');
    const { code, out } = gate(root);
    expect(code).toBe(0);
    expect(out).toContain("1 baselined, none added");
  });

  test("a new offender fails and names the file and line", () => {
    const root = probe("let timer = 0;\nexport let session = null;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), '["probe/src/loop.ts#timer"]\n');
    const { code, out } = gate(root);
    expect(code).toBe(1);
    expect(out).toContain("probe/src/loop.ts:2");
  });

  test("a grown baseline fails and names the entry", () => {
    const root = probe("let timer = 0;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), '["probe/src/loop.ts#timer", "probe/src/loop.ts#session"]\n');
    const { code, out } = gate(root);
    expect(code).toBe(1);
    expect(out).toContain("probe/src/loop.ts#session");
  });

  test("--write drops stale entries but refuses to baseline a new offender", () => {
    const root = probe("let timer = 0;\nexport let session = null;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), '["probe/src/loop.ts#timer"]\n');
    expect(gate(root, ["--write"]).code).toBe(1);
    expect(JSON.parse(readFileSync(join(root, BASELINE_REL), "utf8"))).toEqual(["probe/src/loop.ts#timer"]);
  });

  test("--write shrinks the committed list", () => {
    const root = probe("let timer = 0;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), '["probe/src/loop.ts#timer", "probe/src/gone.ts#old"]\n');
    expect(gate(root, ["--write"]).code).toBe(0);
    expect(JSON.parse(readFileSync(join(root, BASELINE_REL), "utf8"))).toEqual(["probe/src/loop.ts#timer"]);
    expect(gate(root).code).toBe(0);
  });

  test("a missing baseline asks for the one-time bootstrap instead of passing silently", () => {
    const root = probe("let timer = 0;\n");
    const { code, out } = gate(root);
    expect(code).toBe(1);
    expect(out).toContain("--write");
  });

  test("a malformed baseline fails instead of being ignored", () => {
    const root = probe("let timer = 0;\n");
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), "{}\n");
    expect(() => gate(root)).toThrow();
  });
});
