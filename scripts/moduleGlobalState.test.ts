import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";

import { writeGameTree } from "./fixtures/gameTree";
import { findModuleGlobals } from "./moduleGlobalState";

function scan(files: Record<string, string>): string[] {
  const root = writeGameTree("module-globals-", files);
  try {
    return findModuleGlobals(root).map((entry) => entry.key);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("findModuleGlobals", () => {
  test("flags module-level let, exported or not", () => {
    expect(
      scan({ "Games/probe/src/loop.ts": "let timer = 0;\nexport let session = null;\n" }),
    ).toEqual(["Games/probe/src/loop.ts#session", "Games/probe/src/loop.ts#timer"]);
  });

  test("ignores let inside a function or block", () => {
    const source = `export function tick() {
  let local = 0;
  return local;
}
`;
    expect(scan({ "Games/probe/src/loop.ts": source })).toEqual([]);
  });

  test("ignores const and test files", () => {
    expect(
      scan({
        "Games/probe/src/a.ts": "const fixed = 1;\n",
        "Games/probe/src/b.test.ts": "let scratch = 0;\n",
      }),
    ).toEqual([]);
  });

  test("only looks inside a game's src tree", () => {
    expect(scan({ "Games/probe/scripts/tool.ts": "let n = 0;\n" })).toEqual([]);
  });

  test("reports a 1-indexed declaration line", () => {
    const root = writeGameTree("module-globals-", { "Games/probe/src/loop.ts": "// header\n\nlet timer = 0;\n" });
    expect(findModuleGlobals(root)[0]!.where).toBe("Games/probe/src/loop.ts:3");
    rmSync(root, { recursive: true, force: true });
  });
});
