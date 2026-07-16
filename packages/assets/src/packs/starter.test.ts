import { describe, expect, test } from "bun:test";

import { aliases } from "../aliases";
import { buildCatalog } from "../catalogs/build";
import { generatedIndex } from "../generated";
import {
  STARTER_ASSETS,
  STARTER_PACKS,
  STARTER_SOURCE_PACKS,
  STARTER_THEMES,
  starterAliases,
  starterAssetById,
  starterStyle,
} from "./starter";

describe("starter packs", () => {
  test("ships four starter themes with curated assets", () => {
    expect(STARTER_THEMES).toEqual(["people", "props", "nature", "urban"]);
    for (const theme of STARTER_THEMES) {
      expect(STARTER_PACKS[theme].length).toBeGreaterThanOrEqual(4);
      for (const asset of STARTER_PACKS[theme]) {
        expect(asset.theme).toBe(theme);
        expect(asset.license).toBe("CC0-1.0");
        expect(asset.provider === "kaykit" || asset.provider === "quaternius").toBe(true);
      }
    }
  });

  test("every starter target exists in the generated index (pre-measured)", () => {
    const known = new Set(generatedIndex.map((entry) => entry.id));
    for (const asset of STARTER_ASSETS) {
      expect(known.has(asset.target)).toBe(true);
      const entry = generatedIndex.find((row) => row.id === asset.target);
      expect(entry?.dims).toBeDefined();
    }
  });

  test("asset:person_casual and short id resolve through buildCatalog with dims", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    const viaAsset = catalog.resolve("asset:person_casual");
    const viaShort = catalog.resolve("person_casual");
    const viaStarter = catalog.resolve("starter/person_casual");
    const target = catalog.resolve("kaykit-adventurers/Rogue");
    expect(viaAsset).not.toBeNull();
    expect(viaShort?.url).toBe(target?.url);
    expect(viaAsset?.url).toBe(target?.url);
    expect(viaStarter?.url).toBe(target?.url);
    expect(viaAsset?.dims).toEqual(target?.dims);
  });

  test("starter aliases are registered in the global aliases table", () => {
    const keys = new Set(aliases.map((row) => row.key));
    for (const row of starterAliases()) {
      expect(keys.has(row.key)).toBe(true);
    }
  });

  test("starterSource packs cover every starter target's source", () => {
    const sources = new Set(STARTER_SOURCE_PACKS);
    for (const asset of STARTER_ASSETS) {
      const source = asset.target.split("/")[0]!;
      expect(sources.has(source)).toBe(true);
    }
  });

  test("starterAssetById accepts asset: and starter/ prefixes", () => {
    expect(starterAssetById("asset:nature_tree")?.target).toBe("quaternius-stylized-nature/CommonTree_1");
    expect(starterAssetById("starter/prop_crate")?.theme).toBe("props");
    expect(starterStyle("person_casual")?.targetHeight).toBe(1.8);
  });

  test("never references Kenney", () => {
    for (const asset of STARTER_ASSETS) {
      expect(asset.id.toLowerCase()).not.toContain("kenney");
      expect(asset.target.toLowerCase()).not.toContain("kenney");
      expect(asset.author.toLowerCase()).not.toContain("kenney");
    }
  });
});
