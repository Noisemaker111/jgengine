import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  checkAssetAvailability,
  packReferencesForGame,
  referencedPacks,
} from "./checkAssetAvailability";

/**
 * Acceptance tests for the clean-checkout asset-availability gate (#1339): a game that references a
 * model pack which is neither committed nor provisioned must fail, so a fresh clone can never boot
 * into a hard crash on a missing pack. The pure verdict and the game-source pack extraction are
 * exercised independently.
 */

describe("checkAssetAvailability", () => {
  test("fails a referenced pack that is neither committed nor provisioned (the pre-fix bug)", () => {
    const result = checkAssetAvailability({
      references: [{ game: "the-robots", pack: "kaykit-skeletons", via: "buildCatalog" }],
      committed: new Set(["kaykit-adventurers"]),
      provisioned: new Set(),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("kaykit-skeletons");
    expect(result.errors[0]).toContain("the-robots");
    expect(result.errors[0]).toContain("clean checkout");
  });

  test("passes when the pack is committed", () => {
    const result = checkAssetAvailability({
      references: [{ game: "the-robots", pack: "kaykit-skeletons", via: "buildCatalog" }],
      committed: new Set(["kaykit-skeletons"]),
      provisioned: new Set(),
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("passes when the pack is provisioned by a bootstrap pull step", () => {
    const result = checkAssetAvailability({
      references: [{ game: "starhome", pack: "quaternius-modular-scifi", via: "buildCatalog" }],
      committed: new Set(),
      provisioned: new Set(["quaternius-modular-scifi"]),
    });
    expect(result.ok).toBe(true);
  });

  test("ignores the editor-import sentinel pack", () => {
    const result = checkAssetAvailability({
      references: [{ game: "studio-showcase", pack: "imported", via: "path-literal" }],
      committed: new Set(),
      provisioned: new Set(),
    });
    expect(result.ok).toBe(true);
  });

  test("reports every dangling reference, not just the first", () => {
    const result = checkAssetAvailability({
      references: [
        { game: "a", pack: "ghost-one", via: "buildCatalog" },
        { game: "b", pack: "ghost-two", via: "path-literal" },
      ],
      committed: new Set(),
      provisioned: new Set(),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

describe("packReferencesForGame", () => {
  const roots: string[] = [];
  const makeGame = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), "asset-avail-"));
    roots.push(root);
    for (const [rel, contents] of Object.entries(files)) {
      const full = join(root, "src", rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, contents);
    }
    return join(root, "src");
  };
  const cleanup = (): void => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  };

  test("extracts multi-line buildCatalog sources", () => {
    const srcDir = makeGame({
      "game/assets.ts":
        'export const assets = buildCatalog({\n  basePath: "/models",\n  sources: [\n    "quaternius-modular-scifi",\n    "kaykit-space-base",\n  ],\n});\n',
    });
    const refs = packReferencesForGame("the-robots", srcDir);
    const packs = new Set(refs.map((r) => r.pack));
    expect(packs.has("quaternius-modular-scifi")).toBe(true);
    expect(packs.has("kaykit-space-base")).toBe(true);
    expect(refs.every((r) => r.via === "buildCatalog")).toBe(true);
    cleanup();
  });

  test("extracts /models/<pack>/ path literals (the buildCatalog-free surface)", () => {
    const srcDir = makeGame({
      "game/models.ts": 'const PLAYERS = "/models/claudecraft/players";\n',
    });
    const refs = packReferencesForGame("claudecraft", srcDir);
    expect(refs.map((r) => r.pack)).toContain("claudecraft");
    cleanup();
  });
});

describe("referencedPacks (repo integration)", () => {
  test("every pack the real games reference resolves on this checkout", () => {
    const root = join(import.meta.dir, "..");
    const refs = referencedPacks(join(root, "Games"));
    expect(refs.length).toBeGreaterThan(0);
    // The formerly-missing packs from #1339 must now be discovered as referenced.
    const packs = new Set(refs.map((r) => r.pack));
    expect(packs.has("kaykit-skeletons")).toBe(true);
    expect(packs.has("quaternius-modular-scifi")).toBe(true);
    expect(packs.has("kaykit-space-base")).toBe(true);
  });
});
