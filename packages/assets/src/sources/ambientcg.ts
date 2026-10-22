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

/**
 * Exact upstream materials the shared library pins. The family table above generates contiguous
 * `Family001…NNN` ids, which cannot address ambientCG's lettered variants (`Asphalt025C`) or
 * families it does not list; these entries name the archive directly instead of guessing.
 */
interface PinnedMaterial {
  /** Upstream ambientCG id. */
  assetId: string;
  categories: readonly string[];
  /** Optional map roles the pinned 1K-JPG archive carries, beyond color/normal/displacement. */
  maps?: readonly ("roughness" | "ao" | "opacity")[];
  /** Set false for archives published without a displacement map. */
  displacement?: false;
}

const PINNED: readonly PinnedMaterial[] = [
  { assetId: "Asphalt003", categories: ["asphalt", "road", "urban"], maps: ["roughness", "ao"] },
  { assetId: "Asphalt021", categories: ["asphalt", "road", "urban"], maps: ["roughness", "ao"] },
  { assetId: "Asphalt025C", categories: ["asphalt", "road", "urban", "wet"], maps: ["roughness", "ao"] },
  { assetId: "Road001", categories: ["road", "asphalt", "urban"], maps: ["roughness"] },
  { assetId: "Road008A", categories: ["road", "asphalt", "urban", "marking"], maps: ["roughness", "ao"] },
  { assetId: "Concrete006", categories: ["concrete", "urban"], maps: ["roughness", "ao"] },
  { assetId: "Concrete013", categories: ["concrete", "urban"], maps: ["roughness", "ao"] },
  { assetId: "Concrete025", categories: ["concrete", "urban"], maps: ["roughness", "ao"] },
  { assetId: "PaintedPlaster006", categories: ["plaster", "stucco", "wall", "exterior"], maps: ["roughness", "ao"] },
  { assetId: "PaintedPlaster010", categories: ["plaster", "stucco", "wall", "exterior"], maps: ["roughness", "ao"] },
  { assetId: "Plaster001", categories: ["plaster", "stucco", "wall", "interior"], maps: ["roughness"] },
  { assetId: "Bricks004", categories: ["brick", "wall"], maps: ["roughness", "ao"] },
  { assetId: "PaintedBricks002", categories: ["brick", "wall", "painted"], maps: ["roughness", "ao"] },
  { assetId: "PaintedBricks005", categories: ["brick", "wall", "painted"], maps: ["roughness", "ao"] },
  { assetId: "Tiles007", categories: ["tile", "floor", "interior"], maps: ["roughness", "ao"] },
  { assetId: "PavingStones002", categories: ["paving", "stone", "path"], maps: ["roughness", "ao"] },
  { assetId: "PavingStones020", categories: ["paving", "stone", "path"], maps: ["roughness", "ao"] },
  { assetId: "RoofingTiles006", categories: ["roof", "tile", "building"], maps: ["roughness", "ao"] },
  { assetId: "PaintedMetal002", categories: ["metal", "painted", "prop"], maps: ["roughness", "opacity"] },
  { assetId: "PaintedMetal006", categories: ["metal", "painted", "prop"], maps: ["roughness", "ao"] },
  { assetId: "Metal007", categories: ["metal"], maps: ["roughness"] },
  { assetId: "Metal032", categories: ["metal", "brushed"], maps: ["roughness"] },
  { assetId: "CorrugatedSteel009", categories: ["metal", "corrugated", "industrial"], maps: ["roughness", "ao"] },
  { assetId: "DiamondPlate005A", categories: ["metal", "industrial", "floor"], maps: ["roughness", "ao"] },
  { assetId: "Rust007", categories: ["metal", "rust", "derelict"], maps: ["roughness", "ao"] },
  { assetId: "MetalPlates001", categories: ["metal", "plates", "industrial"], maps: ["roughness"] },
  { assetId: "Wood026", categories: ["wood", "planks"], maps: ["roughness"] },
  { assetId: "WoodFloor009", categories: ["wood", "floor", "interior"], maps: ["roughness", "ao"] },
  { assetId: "Planks003", categories: ["wood", "planks", "deck"], maps: ["roughness", "ao"] },
  { assetId: "PaintedWood006A", categories: ["wood", "painted", "exterior"], maps: ["roughness", "ao"] },
  { assetId: "WoodSiding005", categories: ["wood", "siding", "building"], maps: ["roughness", "ao"] },
  { assetId: "Bark002", categories: ["bark", "wood", "nature"], maps: ["roughness", "ao"] },
  { assetId: "Leaf001", categories: ["foliage", "leaf", "nature"], maps: ["roughness", "opacity", "ao"] },
  { assetId: "Leaf003", categories: ["foliage", "leaf", "nature"], maps: ["roughness", "opacity", "ao"] },
  { assetId: "Grass001", categories: ["ground", "grass", "nature"], maps: ["roughness", "ao"] },
  { assetId: "Grass004", categories: ["ground", "grass", "nature"], maps: ["roughness", "ao"] },
  { assetId: "Moss001", categories: ["moss", "nature"], maps: ["roughness", "ao"] },
  { assetId: "ScatteredLeaves008", categories: ["foliage", "leaf", "ground"], maps: ["roughness", "ao"] },
  { assetId: "Ground037", categories: ["ground", "dirt", "forest"], maps: ["roughness", "ao"] },
  { assetId: "Ground055S", categories: ["ground", "sand", "beach"], maps: ["roughness", "ao"] },
  { assetId: "Ground080", categories: ["ground", "sand", "beach"], maps: ["roughness", "ao"] },
  { assetId: "Ground095B", categories: ["ground", "mud", "wet"], maps: ["roughness", "ao"] },
  { assetId: "Gravel002", categories: ["ground", "gravel"], maps: ["roughness"] },
  { assetId: "Rock022", categories: ["rock", "stone"], maps: ["roughness", "ao"] },
  { assetId: "Ice001", categories: ["ice", "winter"], maps: ["roughness"] },
  { assetId: "Snow006", categories: ["ground", "snow", "winter"], maps: ["roughness", "ao"] },
  { assetId: "Fabric007", categories: ["fabric", "cloth"], maps: ["roughness", "ao"] },
  { assetId: "Fabric009", categories: ["fabric", "cloth", "canvas"], maps: ["roughness", "ao"] },
  { assetId: "Plastic006", categories: ["plastic"], maps: ["roughness"] },
  { assetId: "Marble001", categories: ["marble", "stone", "interior"], maps: ["roughness"] },
  { assetId: "Terrazzo005", categories: ["terrazzo", "floor", "interior"], maps: ["roughness"] },
  { assetId: "Fingerprints001", categories: ["glass", "smudge", "overlay"], maps: ["roughness", "opacity"], displacement: false },
];

/** Upstream asset id pinned to a material source id, so the reverse lookup never guesses a variant. */
export const AMBIENTCG_PINNED_ASSET_IDS: ReadonlyMap<string, string> = new Map(
  PINNED.map((entry) => [`ambientcg-${entry.assetId.toLowerCase()}`, entry.assetId]),
);

/** Upstream asset id (`Grass001`) for a material source id (`ambientcg-grass001`). */
export function ambientcgAssetId(source: AssetSource): string {
  const pinned = AMBIENTCG_PINNED_ASSET_IDS.get(source.id);
  if (pinned !== undefined) return pinned;
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

function pinnedSource(entry: PinnedMaterial): AssetSource {
  const optional = entry.maps ?? ["roughness"];
  return {
    id: `ambientcg-${entry.assetId.toLowerCase()}`,
    kind: "material",
    provider: "ambientcg",
    title: `${entry.assetId.replace(/(\d+)([A-Z]*)$/, " $1 $2").replace(/\s+/g, " ").trim()} (PBR material)`,
    license: "CC0-1.0",
    author: "ambientCG",
    categories: entry.categories,
    materialMaps: [
      "color", "normal",
      ...(entry.displacement === false ? [] : ["displacement" as const]),
      ...(optional.includes("roughness") ? ["roughness" as const] : []),
      ...(optional.includes("ao") ? ["ao" as const] : []),
      ...(optional.includes("opacity") ? ["opacity" as const] : []),
    ],
    download: { url: `https://ambientcg.com/get?file=${entry.assetId}_${RESOLUTION}.zip` },
    homepage: `https://ambientcg.com/view?id=${entry.assetId}`,
  };
}

const generatedSources: readonly AssetSource[] = FAMILIES.flatMap((family) =>
  Array.from({ length: family.count }, (_, index) => materialSource(family, index + 1)),
);
const generatedIds = new Set(generatedSources.map((source) => source.id));

/**
 * Every ambientCG material source: the generated family sweep plus the pinned variants the shared
 * library needs. A pinned id the family sweep already covers stays with the sweep, so catalog ids
 * never appear twice.
 */
export const ambientcgSources: readonly AssetSource[] = [
  ...generatedSources,
  ...PINNED.filter((entry) => !generatedIds.has(`ambientcg-${entry.assetId.toLowerCase()}`)).map(pinnedSource),
];
