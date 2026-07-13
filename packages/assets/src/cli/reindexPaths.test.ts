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

  test("reindexing a subset dir preserves other sources' barrel entries", () => {
    const root = mkdtempSync(join(tmpdir(), "jgengine-reindex-"));
    const outDir = join(root, "dist", "generated");
    const spaceDir = join(root, "models", "kenney-space");
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(join(spaceDir, "astronautA.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    try {
      reindex(join(root, "models"), outDir);

      const natureDir = join(root, "models-nature", "kenney-nature");
      mkdirSync(natureDir, { recursive: true });
      writeFileSync(join(natureDir, "tree.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
      reindex(join(root, "models-nature"), outDir);

      const js = readFileSync(join(outDir, "index.js"), "utf8");
      expect(js).toContain('from "./kenney-space.json"');
      expect(js).toContain('from "./kenney-nature.json"');
      expect(existsSync(join(outDir, "kenney-space.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reindexing an all-unknown dir leaves the barrel unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "jgengine-reindex-"));
    const outDir = join(root, "dist", "generated");
    const spaceDir = join(root, "models", "kenney-space");
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(join(spaceDir, "astronautA.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    try {
      reindex(join(root, "models"), outDir);
      const before = readFileSync(join(outDir, "index.ts"), "utf8");

      const customDir = join(root, "custom", "my-local-pack");
      mkdirSync(customDir, { recursive: true });
      writeFileSync(join(customDir, "prop.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
      const result = reindex(join(root, "custom"), outDir);

      expect(readFileSync(join(outDir, "index.ts"), "utf8")).toBe(before);
      expect(result.perSource.some((entry) => entry.source.includes("my-local-pack"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
