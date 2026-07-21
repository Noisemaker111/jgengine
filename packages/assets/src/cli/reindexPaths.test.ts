import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reindex } from "../indexGen";
import { resolveGeneratedDir } from "./paths";

/**
 * The reindex cases build a small model tree on disk and regenerate the barrel,
 * so their wall-time scales with machine load; a full `test:all` run under
 * filesystem/CPU contention can blow past Bun's default 5s per-test budget even
 * though each passes in isolation. Give them an explicit generous budget.
 */
const HEAVY_CASE_TIMEOUT_MS = 30_000;

/**
 * Hermetic scratch root: seed a controlled base under `tmpdir()` (created if
 * absent) before `mkdtemp`, so these cases don't depend on ambient `/tmp` state
 * on a contended shared box.
 */
function makeReindexRoot(): string {
  const base = join(tmpdir(), "jgengine-reindex-tests");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, "root-"));
}

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
    const root = makeReindexRoot();
    const modelsDir = join(root, "models", "quaternius-modular-scifi");
    const outDir = join(root, "dist", "generated");
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, "astronautA.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    try {
      const result = reindex(join(root, "models"), outDir);
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(existsSync(join(outDir, "quaternius-modular-scifi.json"))).toBe(true);
      expect(existsSync(join(outDir, "index.js"))).toBe(true);
      expect(existsSync(join(outDir, "index.ts"))).toBe(true);

      const js = readFileSync(join(outDir, "index.js"), "utf8");
      expect(js).toContain('from "./quaternius-modular-scifi.json"');
      expect(js).toContain("export const generatedIndex");

      const entries = JSON.parse(readFileSync(join(outDir, "quaternius-modular-scifi.json"), "utf8")) as {
        id: string;
        source: string;
        file: string;
      }[];
      expect(entries.some((entry) => entry.id === "quaternius-modular-scifi/astronautA")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, HEAVY_CASE_TIMEOUT_MS);

  test("reindexing a subset dir preserves other sources' barrel entries", () => {
    const root = makeReindexRoot();
    const outDir = join(root, "dist", "generated");
    const spaceDir = join(root, "models", "quaternius-modular-scifi");
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(join(spaceDir, "astronautA.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

    try {
      reindex(join(root, "models"), outDir);

      const natureDir = join(root, "models-nature", "quaternius-stylized-nature");
      mkdirSync(natureDir, { recursive: true });
      writeFileSync(join(natureDir, "tree.glb"), new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
      reindex(join(root, "models-nature"), outDir);

      const js = readFileSync(join(outDir, "index.js"), "utf8");
      expect(js).toContain('from "./quaternius-modular-scifi.json"');
      expect(js).toContain('from "./quaternius-stylized-nature.json"');
      expect(existsSync(join(outDir, "quaternius-modular-scifi.json"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, HEAVY_CASE_TIMEOUT_MS);

  test("reindexing an all-unknown dir leaves the barrel unchanged", () => {
    const root = makeReindexRoot();
    const outDir = join(root, "dist", "generated");
    const spaceDir = join(root, "models", "quaternius-modular-scifi");
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
  }, HEAVY_CASE_TIMEOUT_MS);
});
