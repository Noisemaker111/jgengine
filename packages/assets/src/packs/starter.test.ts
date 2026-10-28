import { describe, expect, test } from "bun:test";

import { aliases } from "../aliases";
import { buildCatalog } from "../catalogs/build";
import { findLibraryModelByName, libraryModel } from "../catalogs/modelLibrary";
import { generatedIndex } from "../generated";
import {
  STARTER_ASSETS,
  STARTER_PACKS,
  STARTER_PEOPLE,
  STARTER_SOURCE_PACKS,
  STARTER_THEMES,
  starterAliases,
  starterAssetById,
  starterStyle,
} from "./starter";

describe("starter packs", () => {
  test("ships three starter themes with curated assets", () => {
    expect(STARTER_THEMES).toEqual(["props", "nature", "urban"]);
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

  test("starter people are realistic library humans, a man and a woman, with the full action set", () => {
    expect(STARTER_PEOPLE.length).toBeGreaterThanOrEqual(2);
    for (const name of STARTER_PEOPLE) {
      expect(findLibraryModelByName(name)?.origin.provider).toBe("rocketbox");
      const animation = libraryModel(name).animation;
      expect(typeof animation === "object" && animation.humanoidActions).toBe(true);
    }
    expect(STARTER_SOURCE_PACKS).not.toContain("kaykit-adventurers");
    expect(buildCatalog({ basePath: "/models" }).resolve("asset:person_casual")).toBeNull();
  });

  test("asset:prop_crate and short id resolve through buildCatalog with dims", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    const viaAsset = catalog.resolve("asset:prop_crate");
    const viaShort = catalog.resolve("prop_crate");
    const viaStarter = catalog.resolve("starter/prop_crate");
    const target = catalog.resolve(starterAssetById("prop_crate")?.target ?? "");
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
    expect(starterStyle("prop_crate")).toBeDefined();
  });

  test("never references Kenney", () => {
    for (const asset of STARTER_ASSETS) {
      expect(asset.id.toLowerCase()).not.toContain("kenney");
      expect(asset.target.toLowerCase()).not.toContain("kenney");
      expect(asset.author.toLowerCase()).not.toContain("kenney");
    }
  });
});
