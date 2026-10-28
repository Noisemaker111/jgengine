import type { AssetAlias } from "../manifest";

/**
 * Curated drop-in starter themes for new games. Each entry maps a short semantic
 * id (also registered as `asset:<id>`) to a live catalog GLB that is already
 * measured (dims/anchor flow from the generated index via the alias target).
 * Games wire them as `objectModels: { crate: "asset:prop_crate" }`. People are not a starter
 * theme: a person is a realistic rigged human from the model library ({@link STARTER_PEOPLE}).
 * Never Kenney — Quaternius / KayKit only.
 * @capability starter-packs themed CC0 model ids (props/nature/urban) ready for objectModels
 */

/** props | nature | urban — the three curated starter themes. */
export type StarterTheme = "props" | "nature" | "urban";

/** One curated starter model: short id, theme, live catalog target, license, suggested height. */
export interface StarterAsset {
  /** Short id — also registered as `asset:<id>` and `starter/<id>`. */
  id: string;
  theme: StarterTheme;
  /** Live catalog id (pack/file); must exist in the generated index. */
  target: string;
  /** Suggested height when used as a character/prop figure. */
  targetHeight?: number;
  title: string;
  license: "CC0-1.0";
  author: string;
  provider: "kaykit" | "quaternius";
}

const PROPS: readonly StarterAsset[] = [
  {
    id: "prop_crate",
    theme: "props",
    target: "kaykit-dungeon/crates_stacked",
    targetHeight: 1.2,
    title: "Stacked crates",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "prop_barrel",
    theme: "props",
    target: "kaykit-dungeon/barrel_large",
    targetHeight: 1.1,
    title: "Barrel",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "prop_chest",
    theme: "props",
    target: "kaykit-dungeon/chest",
    targetHeight: 0.9,
    title: "Chest",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "prop_table",
    theme: "props",
    target: "kaykit-furniture/table_medium",
    targetHeight: 0.85,
    title: "Table",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "prop_bench",
    theme: "props",
    target: "kaykit-city-builder/bench",
    targetHeight: 0.7,
    title: "Bench",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
];

const NATURE: readonly StarterAsset[] = [
  {
    id: "nature_tree",
    theme: "nature",
    target: "quaternius-stylized-nature/CommonTree_1",
    targetHeight: 4.5,
    title: "Common tree",
    license: "CC0-1.0",
    author: "Quaternius",
    provider: "quaternius",
  },
  {
    id: "nature_pine",
    theme: "nature",
    target: "quaternius-stylized-nature/Pine_1",
    targetHeight: 5,
    title: "Pine tree",
    license: "CC0-1.0",
    author: "Quaternius",
    provider: "quaternius",
  },
  {
    id: "nature_bush",
    theme: "nature",
    target: "quaternius-stylized-nature/Bush_Common",
    targetHeight: 1.2,
    title: "Bush",
    license: "CC0-1.0",
    author: "Quaternius",
    provider: "quaternius",
  },
  {
    id: "nature_rock",
    theme: "nature",
    target: "quaternius-stylized-nature/Rock_Medium_1",
    targetHeight: 1.4,
    title: "Rock",
    license: "CC0-1.0",
    author: "Quaternius",
    provider: "quaternius",
  },
  {
    id: "nature_dead_tree",
    theme: "nature",
    target: "quaternius-stylized-nature/DeadTree_1",
    targetHeight: 4,
    title: "Dead tree",
    license: "CC0-1.0",
    author: "Quaternius",
    provider: "quaternius",
  },
];

const URBAN: readonly StarterAsset[] = [
  {
    id: "urban_building",
    theme: "urban",
    target: "kaykit-city-builder/building_A",
    targetHeight: 8,
    title: "City building",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "urban_car",
    theme: "urban",
    target: "kaykit-city-builder/car_sedan",
    targetHeight: 1.4,
    title: "Sedan",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "urban_streetlight",
    theme: "urban",
    target: "kaykit-city-builder/streetlight",
    targetHeight: 4,
    title: "Streetlight",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
  {
    id: "urban_box",
    theme: "urban",
    target: "kaykit-city-builder/box_A",
    targetHeight: 0.8,
    title: "Street box",
    license: "CC0-1.0",
    author: "Kay Lousberg (KayKit)",
    provider: "kaykit",
  },
];

/** Flat list of every curated starter asset across themes. */
export const STARTER_ASSETS: readonly StarterAsset[] = [...PROPS, ...NATURE, ...URBAN];

/** Theme → assets table for browse/docs (`STARTER_PACKS.props`, …). */
export const STARTER_PACKS: Readonly<Record<StarterTheme, readonly StarterAsset[]>> = {
  props: PROPS,
  nature: NATURE,
  urban: URBAN,
};

/** Ordered starter theme ids: props, nature, urban. */
export const STARTER_THEMES: readonly StarterTheme[] = ["props", "nature", "urban"];

/**
 * The model-library people a fresh game pulls with the starter packs: realistic rigged humans, a
 * man and a woman, that `libraryModel(name)` animates with the full humanoid clip set.
 */
export const STARTER_PEOPLE: readonly string[] = ["human/man-casual", "human/woman-casual"];

/** Source pack ids a game must pull so every starter asset URL resolves on disk. */
export const STARTER_SOURCE_PACKS: readonly string[] = [
  "kaykit-dungeon",
  "kaykit-furniture",
  "kaykit-city-builder",
  "quaternius-stylized-nature",
];

/**
 * Alias rows for the curated starter ids. Registered in the package aliases table so
 * `buildCatalog` resolves `asset:prop_crate`, `prop_crate`, and
 * `starter/prop_crate` to the same measured GLB.
 * @internal
 */
export function starterAliases(): readonly AssetAlias[] {
  const rows: AssetAlias[] = [];
  for (const asset of STARTER_ASSETS) {
    rows.push({ key: asset.id, target: asset.target });
    rows.push({ key: `asset:${asset.id}`, target: asset.target });
    rows.push({ key: `starter/${asset.id}`, target: asset.target });
  }
  return rows;
}

/** @internal */
export function starterAssetById(id: string): StarterAsset | undefined {
  const bare = id.startsWith("asset:")
    ? id.slice("asset:".length)
    : id.startsWith("starter/")
      ? id.slice("starter/".length)
      : id;
  return STARTER_ASSETS.find((entry) => entry.id === bare);
}

/** @internal */
export function starterStyle(id: string): { targetHeight?: number } | undefined {
  const asset = starterAssetById(id);
  if (asset === undefined) return undefined;
  return asset.targetHeight === undefined ? {} : { targetHeight: asset.targetHeight };
}
