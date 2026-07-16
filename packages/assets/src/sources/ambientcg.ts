import type { AssetSource } from "../manifest";

/**
 * ambientCG (https://ambientcg.com) — CC0 PBR materials, downloaded as flat
 * 1K-JPG zips from the site's stable `/get?file=` endpoint and mirrored to
 * this repo's `packs` release like every other source. Each entry is one
 * material; families are numbered `Family001…FamilyNNN` upstream, so the
 * catalog is generated per family instead of hand-typing hundreds of ids.
 */

const RESOLUTION = "1K-JPG";

interface MaterialFamily {
  family: string;
  count: number;
  categories: readonly string[];
}

const FAMILIES: readonly MaterialFamily[] = [
  { family: "Grass", count: 5, categories: ["ground", "grass", "nature"] },
  { family: "Ground", count: 25, categories: ["ground", "dirt", "mud"] },
  { family: "Rock", count: 25, categories: ["rock", "cliff", "stone"] },
  { family: "Rocks", count: 8, categories: ["rock", "scatter"] },
  { family: "Gravel", count: 15, categories: ["ground", "gravel"] },
  { family: "Snow", count: 6, categories: ["ground", "snow", "winter"] },
  { family: "Ice", count: 3, categories: ["ice", "winter"] },
  { family: "Lava", count: 4, categories: ["lava", "volcanic"] },
  { family: "Moss", count: 2, categories: ["moss", "nature"] },
  { family: "Bark", count: 8, categories: ["bark", "wood", "nature"] },
  { family: "Wood", count: 30, categories: ["wood"] },
  { family: "WoodFloor", count: 25, categories: ["wood", "floor", "interior"] },
  { family: "Planks", count: 12, categories: ["wood", "planks"] },
  { family: "Bricks", count: 30, categories: ["brick", "wall"] },
  { family: "PavingStones", count: 25, categories: ["paving", "stone", "path"] },
  { family: "Tiles", count: 30, categories: ["tile", "floor", "interior"] },
  { family: "Concrete", count: 25, categories: ["concrete", "urban"] },
  { family: "Asphalt", count: 12, categories: ["asphalt", "road", "urban"] },
  { family: "Metal", count: 25, categories: ["metal"] },
  { family: "MetalPlates", count: 10, categories: ["metal", "plates", "scifi"] },
  { family: "Fabric", count: 25, categories: ["fabric", "cloth"] },
  { family: "Leather", count: 12, categories: ["leather"] },
  { family: "Marble", count: 12, categories: ["marble", "stone", "interior"] },
  { family: "Plaster", count: 7, categories: ["plaster", "wall", "interior"] },
  { family: "Facade", count: 6, categories: ["facade", "building"] },
  { family: "Terrazzo", count: 8, categories: ["floor", "interior"] },
  { family: "Wicker", count: 4, categories: ["wicker"] },
  { family: "Rope", count: 2, categories: ["rope"] },
  { family: "Cardboard", count: 3, categories: ["cardboard", "prop"] },
  { family: "Paper", count: 3, categories: ["paper", "prop"] },
  { family: "RoofingTiles", count: 8, categories: ["roof", "tile", "building"] },
];

/** Upstream asset id (`Grass001`) for a material source id (`ambientcg-grass001`). */
export function ambientcgAssetId(source: AssetSource): string {
  const suffix = source.id.replace(/^ambientcg-/, "");
  const digits = suffix.match(/\d+$/)?.[0] ?? "";
  const family = FAMILIES.find(
    (entry) => entry.family.toLowerCase() === suffix.slice(0, suffix.length - digits.length),
  );
  return `${family?.family ?? suffix}${digits}`;
}

function materialSource(family: MaterialFamily, index: number): AssetSource {
  const assetId = `${family.family}${String(index).padStart(3, "0")}`;
  return {
    id: `ambientcg-${assetId.toLowerCase()}`,
    kind: "material",
    provider: "ambientcg",
    title: `${family.family} ${String(index).padStart(3, "0")} (PBR material)`,
    license: "CC0-1.0",
    author: "ambientCG",
    categories: family.categories,
    download: { url: `https://ambientcg.com/get?file=${assetId}_${RESOLUTION}.zip` },
    homepage: `https://ambientcg.com/view?id=${assetId}`,
  };
}

/** Every ambientCG material source, generated per family (`ambientcg-grass001` … ). */
export const ambientcgSources: readonly AssetSource[] = FAMILIES.flatMap((family) =>
  Array.from({ length: family.count }, (_, index) => materialSource(family, index + 1)),
);
