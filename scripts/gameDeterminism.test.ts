import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findRandomnessLeaks } from "./gameDeterminism";

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "determinism-"));
  try {
    for (const [rel, source] of Object.entries(files)) {
      const path = join(root, rel);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, source);
    }
    return findRandomnessLeaks(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("findRandomnessLeaks", () => {
  test("flags a file using Math.random and lists every line", () => {
    const found = scan({ "Games/probe/src/sim.ts": "const a = Math.random();\nconst b = 1;\nconst c = Math.random();\n" });
    expect(found).toHaveLength(1);
    expect(found[0]!.key).toBe("Games/probe/src/sim.ts");
    expect(found[0]!.where).toBe("Games/probe/src/sim.ts:1,3");
  });

  test("clears a file that uses ctx.rng instead", () => {
    expect(scan({ "Games/probe/src/sim.ts": "const a = ctx.rng();\n" })).toEqual([]);
  });

  test("ignores test files and anything outside a game's src", () => {
    expect(
      scan({
        "Games/probe/src/sim.test.ts": "const a = Math.random();\n",
        "Games/probe/scripts/tool.ts": "const a = Math.random();\n",
      }),
    ).toEqual([]);
  });

  test("keys per file so the baseline survives line shifts", () => {
    const before = scan({ "Games/probe/src/sim.ts": "const a = Math.random();\n" });
    const after = scan({ "Games/probe/src/sim.ts": "// a new header line\n\nconst a = Math.random();\n" });
    expect(after[0]!.key).toBe(before[0]!.key);
  });
});
