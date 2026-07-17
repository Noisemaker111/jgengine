import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { externalGlbImages } from "../packages/assets/src/download";

const MODELS_ROOT = join(import.meta.dir, "..", "apps", "dev", "public", "models");

/**
 * Packs whose committed models still reference textures that are not in the
 * repo. Entries here render untextured (white) in every consuming game — the
 * list may only shrink. Tracked in #1005.
 */
const KNOWN_UNRESOLVED_PACKS = new Set([
  // ~100MB of 2k texture PNGs; decide downscale-or-commit before shipping them.
  "quaternius-stylized-nature",
]);

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
