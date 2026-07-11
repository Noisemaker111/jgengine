import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reindex } from "../indexGen";
import { resolveGeneratedDir } from "./paths";

describe("resolveGeneratedDir", () => {
  test("published CLI (dist/cli) writes into dist/generated", () => {
    expect(resolveGeneratedDir(join("pkg", "dist", "cli")).replace(/\\/g, "/")).toMatch(/pkg\/dist\/generated$/);
  });

  test("source CLI (src/cli) writes into src/generated", () => {
    expect(resolveGeneratedDir(join("pkg", "src", "cli")).replace(/\\/g, "/")).toMatch(/pkg\/src\/generated$/);
  });
});

describe("reindex post-install tree", () => {
  test("writes JSON + JS barrel that a published buildCatalog can import", () => {
    const root = mkdtempSync(join(tmpdir(), "jgengine-reindex-"));
    const modelsDir = join(root, "models", "kenney-space");
    const outDir = join(root, "dist", "generated");
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, "astronautA.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    try {
      const result = reindex(join(root, "models"), outDir);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(existsSync(join(outDir, "kenney-space.json"))).toBe(true);
      expect(existsSync(join(outDir, "index.js"))).toBe(true);
      expect(existsSync(join(outDir, "index.ts"))).toBe(true);

      const js = readFileSync(join(outDir, "index.js"), "utf8");
      expect(js).toContain('from "./kenney-space.json"');
      expect(js).toContain("export const generatedIndex");

      const entries = JSON.parse(readFileSync(join(outDir, "kenney-space.json"), "utf8")) as {
        id: string;
        source: string;
        file: string;
      }[];
      expect(entries.some((entry) => entry.id === "kenney-space/astronautA")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
