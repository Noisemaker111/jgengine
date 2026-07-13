import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { entryForSpriteFile, keyFromSpriteFile, reindexSprites } from "./spriteIndexGen";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "jgengine-assets-sprites-"));
}

describe("keyFromSpriteFile", () => {
  test("strips the svg or png extension", () => {
    expect(keyFromSpriteFile("sword.svg")).toBe("sword");
    expect(keyFromSpriteFile("backpack.png")).toBe("backpack");
  });
});

describe("entryForSpriteFile", () => {
  test("builds a source-prefixed id with no dims", () => {
    const source = { id: "gameicons-icons", provider: "gameicons", title: "t", license: "l", author: "a", categories: ["icon"], download: { url: "https://x" } } as const;
    const entry = entryForSpriteFile(source, "sword.svg");
    expect(entry).toEqual({ id: "gameicons-icons/sword", source: "gameicons-icons", categories: ["icon"], file: "sword.svg" });
  });
});

describe("reindexSprites", () => {
  test("writes one json file per pulled source plus a barrel, skipping unknown source dirs", () => {
    const spritesDir = makeTmpDir();
    const outDir = makeTmpDir();
    try {
      const packDir = join(spritesDir, "gameicons-icons");
      mkdirSync(packDir, { recursive: true });
      writeFileSync(join(packDir, "sword.svg"), "stub");
      writeFileSync(join(packDir, "shield.svg"), "stub");
      mkdirSync(join(spritesDir, "not-a-real-source"), { recursive: true });
      writeFileSync(join(spritesDir, "not-a-real-source", "x.png"), "stub");

      const result = reindexSprites(spritesDir, outDir);

      expect(result.total).toBe(2);
      expect(result.perSource).toContainEqual({ source: "gameicons-icons", count: 2 });
      expect(result.perSource.some((row) => row.source.includes("not-a-real-source"))).toBe(true);

      const written = JSON.parse(readFileSync(join(outDir, "gameicons-icons.json"), "utf8"));
      expect(written).toEqual([
        { id: "gameicons-icons/shield", source: "gameicons-icons", categories: ["icon", "item", "ability", "ui"], file: "shield.svg" },
        { id: "gameicons-icons/sword", source: "gameicons-icons", categories: ["icon", "item", "ability", "ui"], file: "sword.svg" },
      ]);

      const barrel = readFileSync(join(outDir, "index.ts"), "utf8");
      expect(barrel).toContain("generatedSpriteIndex");
      expect(barrel).toContain("gameicons-icons.json");
    } finally {
      rmSync(spritesDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
