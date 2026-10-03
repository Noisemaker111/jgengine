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
  ao: readonly number[];
  withoutRoughness?: readonly number[];
}

// Optional-map availability for the pinned 1K-JPG variants: https://ambientcg.com/api/v2/full_json?type=Material&include=downloadData
const FAMILIES: readonly MaterialFamily[] = [
  { family: "Grass", count: 5, categories: ["ground", "grass", "nature"], ao: [1, 2, 3, 4, 5] },
  { family: "Ground", count: 25, categories: ["ground", "dirt", "mud"], ao: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25] },
  { family: "Rock", count: 25, categories: ["rock", "cliff", "stone"], ao: [2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] },
  { family: "Rocks", count: 8, categories: ["rock", "scatter"], ao: [1, 2, 3, 4, 5, 6, 7, 8] },
  { family: "Gravel", count: 15, withoutRoughness: [1], categories: ["ground", "gravel"], ao: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  { family: "Snow", count: 6, categories: ["ground", "snow", "winter"], ao: [6] },
  { family: "Ice", count: 3, categories: ["ice", "winter"], ao: [] },
  { family: "Lava", count: 4, categories: ["lava", "volcanic"], ao: [] },
  { family: "Moss", count: 2, categories: ["moss", "nature"], ao: [1, 2] },
  { family: "Bark", count: 8, categories: ["bark", "wood", "nature"], ao: [2, 3, 4, 5, 6, 7, 8] },
  { family: "Wood", count: 30, categories: ["wood"], ao: [11] },
  { family: "WoodFloor", count: 25, categories: ["wood", "floor", "interior"], ao: [3, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] },
  { family: "Planks", count: 12, categories: ["wood", "planks"], ao: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { family: "Bricks", count: 30, categories: ["brick", "wall"], ao: [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 22, 23, 24, 25, 26, 28, 30] },
  { family: "PavingStones", count: 25, categories: ["paving", "stone", "path"], ao: [2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25] },
  { family: "Tiles", count: 30, categories: ["tile", "floor", "interior"], ao: [7, 8, 9, 10, 11, 17, 18, 19, 26, 27, 28] },
  { family: "Concrete", count: 25, withoutRoughness: [1], categories: ["concrete", "urban"], ao: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 25] },
  { family: "Asphalt", count: 12, categories: ["asphalt", "road", "urban"], ao: [3, 4, 5, 6, 7, 8] },
  { family: "Metal", count: 25, categories: ["metal"], ao: [] },
  { family: "MetalPlates", count: 10, categories: ["metal", "plates", "scifi"], ao: [10] },
  { family: "Fabric", count: 25, categories: ["fabric", "cloth"], ao: [7, 8, 9] },
  { family: "Leather", count: 12, categories: ["leather"], ao: [8] },
  { family: "Marble", count: 12, categories: ["marble", "stone", "interior"], ao: [] },
  { family: "Plaster", count: 7, categories: ["plaster", "wall", "interior"], ao: [7] },
  { family: "Facade", count: 6, categories: ["facade", "building"], ao: [] },
  { family: "Terrazzo", count: 8, categories: ["floor", "interior"], ao: [] },
  { family: "Wicker", count: 4, categories: ["wicker"], ao: [1, 2, 3, 4] },
  { family: "Rope", count: 2, categories: ["rope"], ao: [] },
  { family: "Cardboard", count: 3, categories: ["cardboard", "prop"], ao: [] },
  { family: "Paper", count: 3, categories: ["paper", "prop"], ao: [] },
  { family: "RoofingTiles", count: 8, categories: ["roof", "tile", "building"], ao: [6, 7, 8] },
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
    materialMaps: [
      "color", "normal", "displacement",
      ...(family.withoutRoughness?.includes(index) ? [] : ["roughness" as const]),
      ...(family.ao.includes(index) ? ["ao" as const] : []),
    ],
    download: { url: `https://ambientcg.com/get?file=${assetId}_${RESOLUTION}.zip` },
    homepage: `https://ambientcg.com/view?id=${assetId}`,
  };
}

/** Every ambientCG material source, generated per family (`ambientcg-grass001` … ). */
export const ambientcgSources: readonly AssetSource[] = FAMILIES.flatMap((family) =>
  Array.from({ length: family.count }, (_, index) => materialSource(family, index + 1)),
);
