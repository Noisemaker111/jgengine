import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { externalGlbImages } from "../packages/assets/src/download";

const MODELS_ROOT = join(import.meta.dir, "..", "apps", "dev", "public", "models");

/**
 * Packs whose committed models still reference textures that are not in the
 * repo. Entries here render untextured (white) in every consuming game — the
 * list may only shrink. Tracked in #1005.
 */
const KNOWN_UNRESOLVED_PACKS = new Set<string>([]);

describe("committed model packs resolve their textures", () => {
  const packs = readdirSync(MODELS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  test("model packs exist", () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  for (const pack of packs) {
    test(`${pack}: every external image URI resolves inside the pack`, () => {
      const dir = join(MODELS_ROOT, pack);
      const missing = new Set<string>();
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".glb")) continue;
        for (const image of externalGlbImages(readFileSync(join(dir, file)))) {
          if (!existsSync(join(dir, image))) missing.add(`${file} -> ${image}`);
        }
      }
      if (KNOWN_UNRESOLVED_PACKS.has(pack)) {
        // Ratchet: once a pack is repaired, delete its allowlist entry so it can't regress.
        expect(missing.size).toBeGreaterThan(0);
        return;
      }
      expect([...missing].sort()).toEqual([]);
    });
  }

  test("no committed pack directory is empty", () => {
    const empty = packs.filter((pack) => readdirSync(join(MODELS_ROOT, pack)).length === 0);
    expect(empty).toEqual([]);
  });
});


function auditNestedPack(uri: string, texturePresent: boolean) {
  const root = mkdtempSync(join(tmpdir(), "jg-nested-pack-"));
  try {
    const pack = join(root, "authored");
    mkdirSync(join(pack, "settlements"), { recursive: true });
    mkdirSync(join(pack, "scenery"));
    if (texturePresent) writeFileSync(join(pack, "scenery/map.png"), "fixture image");
    const text = JSON.stringify({ asset: { version: "2.0" }, images: [{ uri }] });
    const json = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, " "));
    const glb = Buffer.alloc(20 + json.length);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(json.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    json.copy(glb, 20);
    writeFileSync(join(pack, "settlements/scene.glb"), glb);
    return spawnSync(process.execPath, [join(import.meta.dir, "check-pack-texture-layout.ts"), root], {
      encoding: "utf8", timeout: 10_000,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("texture layout checker validates nested authored GLBs against sibling directories", () => {
  const valid = auditNestedPack("../scenery/map.png", true);
  expect(valid.status).toBe(0);
  expect(valid.stdout).toContain("1/1 GLB texture reference(s)");
  const missing = auditNestedPack("../scenery/map.png", false);
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('authored/settlements/scene.glb -> "../scenery/map.png"');
});

test("texture layout checker rejects nonportable root-relative nested image URIs", () => {
  const result = auditNestedPack("/models/authored/scenery/map.png", true);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("root-relative image URI");
});
