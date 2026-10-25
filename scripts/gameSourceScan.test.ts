import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { eachGameSource } from "./gameSourceScan";
import { findModuleGlobals } from "./moduleGlobalState";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "game-source-scan-")); // fixture-location: allow plain source text on disk, no engine imports resolve from it
  roots.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

describe("eachGameSource", () => {
  test("reads non-test sources of games with an index barrel", () => {
    const root = fixture({
      "games/arena/src/index.tsx": "export {};\n",
      "games/arena/src/game/loop.ts": "let timer = 0;\n",
      "games/arena/src/game/loop.test.ts": "let fixture = 1;\n",
      "games/notes/src/readme.ts": "let ignored = 1;\n",
    });
    expect(eachGameSource(root).map((file) => file.rel).sort()).toEqual(["games/arena/src/game/loop.ts", "games/arena/src/index.tsx"]);
    expect(findModuleGlobals(root).map((finding) => finding.where)).toEqual(["games/arena/src/game/loop.ts:1"]);
  });
});
