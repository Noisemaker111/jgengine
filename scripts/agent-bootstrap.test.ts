import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { firstMissingCoreDistEntry } from "./agent-bootstrap";

/** Build a src/dist fixture mirroring how tsgo emits one dist/<path>.js per source. */
function fixture(): { root: string; src: string; dist: string } {
  const root = mkdtempSync(join(tmpdir(), "jg-bootstrap-"));
  const src = join(root, "src");
  const dist = join(root, "dist");
  mkdirSync(join(src, "vfx"), { recursive: true });
  mkdirSync(join(dist, "vfx"), { recursive: true });

  // Non-test sources that must each have a dist/<path>.js.
  writeFileSync(join(src, "index.ts"), "export const a = 1;\n");
  writeFileSync(join(src, "vfx", "screenEffects.ts"), "export const b = 2;\n");
  // Excluded from tsconfig.build — must NOT be required in dist.
  writeFileSync(join(src, "vfx", "screenEffects.test.ts"), "test('x', () => {});\n");
  writeFileSync(join(src, "testFixtures.ts"), "export const fix = 0;\n");
  // Non-ts assets never emit js.
  writeFileSync(join(src, "notes.md"), "# not compiled\n");

  return { root, src, dist };
}

describe("firstMissingCoreDistEntry", () => {
  test("returns null when every non-test source has its dist js", () => {
    const { root, src, dist } = fixture();
    writeFileSync(join(dist, "index.js"), "");
    writeFileSync(join(dist, "vfx", "screenEffects.js"), "");
    try {
      // Absent test/fixture/md outputs do not count as missing.
      expect(firstMissingCoreDistEntry(src, dist)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("flags a partial dist that satisfies a bare directory-exists check", () => {
    const { root, src, dist } = fixture();
    writeFileSync(join(dist, "index.js"), "");
    // vfx/screenEffects.js is missing — the exact real-world failure.
    try {
      expect(firstMissingCoreDistEntry(src, dist)).toBe(join("vfx", "screenEffects.js"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports the dist directory itself when it is absent", () => {
    const { root, src } = fixture();
    try {
      expect(firstMissingCoreDistEntry(src, join(root, "nope"))).toBe("dist");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
