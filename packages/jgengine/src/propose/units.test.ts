import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { unifiedDiff } from "./diff";
import { readProposalLiteral } from "./literal";
import { kebab } from "./migrate";
import { exportedNames, importRefs, stripComments } from "./source";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "jg-propose-unit-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("stripComments", () => {
  test("blanks comments, keeps strings and length", () => {
    const text = 'const a = "// not a comment"; // gone\n/* block\n */ const b = `/* kept */`;';
    const clean = stripComments(text);
    expect(clean).toHaveLength(text.length);
    expect(clean).toContain('"// not a comment"');
    expect(clean).toContain("`/* kept */`");
    expect(clean).not.toContain("gone");
    expect(clean).not.toContain("block");
  });
});

describe("importRefs", () => {
  test("reads every import form and what it binds", () => {
    const text = [
      'import { a, type B, c as d } from "./x";',
      'import def, { e } from "../y.js";',
      'import * as ns from "pkg";',
      'import type T from "@jgengine/core/t";',
      'export { f } from "./f";',
      'export * from "./g";',
      'import "./side";',
      'const lazy = import("./lazy");',
      '// import { no } from "./commented";',
      "export { local };",
    ].join("\n");
    const refs = importRefs(text);
    expect(refs.map((ref) => [ref.specifier, ref.names])).toEqual([
      ["./x", ["a", "B", "c"]],
      ["../y.js", ["e", "default"]],
      ["pkg", ["*"]],
      ["@jgengine/core/t", ["default"]],
      ["./f", ["f"]],
      ["./g", ["*"]],
      ["./side", []],
      ["./lazy", ["*"]],
    ]);
    for (const ref of refs) expect(text.slice(ref.at + 1, ref.at + 1 + ref.specifier.length)).toBe(ref.specifier);
  });

  test("an export list without from does not swallow the next import", () => {
    const refs = importRefs('export {\n  a,\n}\nimport b from "./b";');
    expect(refs.map((ref) => [ref.specifier, ref.names])).toEqual([["./b", ["default"]]]);
  });
});

describe("exportedNames", () => {
  test("declarations, lists, defaults and relative star re-exports", () => {
    const root = tree({
      "index.ts": [
        "export function one() {}",
        "export const two = 2;",
        "export interface Three {}",
        "export type Four = 4;",
        "export declare class Five {}",
        "const six = 6; export { six, six as seven };",
        'export * from "./more";',
        'export * as space from "./more";',
        'export * from "elsewhere";',
        "export default one;",
      ].join("\n"),
      "more.ts": "export enum Eight { A }\nexport default 1;\n",
    });
    expect([...exportedNames(join(root, "index.ts"))].sort()).toEqual(["Eight", "Five", "Four", "Three", "default", "one", "seven", "six", "space", "two"].sort());
  });
});

describe("readProposalLiteral", () => {
  test("reads the literal with comments, quotes, trailing commas and as const", () => {
    const result = readProposalLiteral(`
      import { defineEngineProposal } from "@jgengine/core/meta/proposal";
      export const proposal = defineEngineProposal({
        // where it goes
        id: 'creature-terrain-mode',
        "target": "@jgengine/core/ai/creatureDriver",
        need: \`Creatures cannot
follow terrain.\`,
        kind: "extend",
        exports: ["createCreatureDriver",],
      } as const);
    `);
    expect(result).toEqual({
      ok: true,
      value: { id: "creature-terrain-mode", target: "@jgengine/core/ai/creatureDriver", need: "Creatures cannot\nfollow terrain.", kind: "extend", exports: ["createCreatureDriver"] },
    });
  });

  test("rejects computed metadata and a missing call", () => {
    expect(readProposalLiteral("defineEngineProposal({ id: ID })")).toMatchObject({ ok: false, error: expect.stringContaining("plain literal") });
    expect(readProposalLiteral("defineEngineProposal({ ...base })")).toMatchObject({ ok: false });
    expect(readProposalLiteral("defineEngineProposal({ need: `a ${b}` })")).toMatchObject({ ok: false, error: expect.stringContaining("interpolate") });
    expect(readProposalLiteral("export const x = 1;")).toMatchObject({ ok: false, error: expect.stringContaining("no defineEngineProposal") });
  });
});

describe("unifiedDiff", () => {
  test("equal texts have no diff", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", { before: "x", after: "y" })).toBe("");
  });

  test("hunks with context, merged when close", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"].join("\n");
    const after = ["1", "2", "3", "4", "five", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"].join("\n");
    expect(unifiedDiff(before, after, { before: "packages/core/src/a.ts", after: "games/x/a.engine.ts" })).toBe(
      [
        "--- a/packages/core/src/a.ts",
        "+++ b/games/x/a.engine.ts",
        "@@ -2,7 +2,7 @@",
        " 2",
        " 3",
        " 4",
        "-5",
        "+five",
        " 6",
        " 7",
        " 8",
        "@@ -13,3 +13,4 @@",
        " 13",
        " 14",
        " 15",
        "+16",
        "",
      ].join("\n"),
    );
  });
});

test("kebab", () => {
  expect(kebab("creatureBody")).toBe("creature-body");
  expect(kebab("basebuilding")).toBe("basebuilding");
  expect(kebab("summonedEncounter")).toBe("summoned-encounter");
});
