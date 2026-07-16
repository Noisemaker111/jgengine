import type { AssetSource } from "../manifest";

/**
 * Quaternius megakits. The quaternius.com pack pages JS-gate the free download
 * (no `.zip` in HTML), so scrape fails in CI. Free **Standard** zips are also
 * mirrored on OpenGameArt with stable direct URLs and include a `glTF/` tree
 * (packed to `.glb` at extract). Prefer pinned OGA URLs when available.
 */
interface QuaterniusPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
  /** OpenGameArt direct zip when known (Standard free pack). */
  ogaZip?: string;
}

const OGA_FILES = "https://opengameart.org/sites/default/files";

const QUATERNIUS_PACKS: readonly QuaterniusPack[] = [
  {
    id: "quaternius-stylized-nature",
    slug: "stylizednaturemegakit",
    title: "Stylized Nature MegaKit",
    categories: ["nature", "environment", "prop"],
    ogaZip: `${OGA_FILES}/stylized_nature_megakitstandard.zip`,
  },
  {
    id: "quaternius-medieval-village",
    slug: "medievalvillagemegakit",
    title: "Medieval Village MegaKit",
    categories: ["building", "medieval", "environment"],
    ogaZip: `${OGA_FILES}/medieval_village_megakitstandard.zip`,
  },
  {
    id: "quaternius-downtown-city",
    slug: "downtowncitymegakit",
    title: "Downtown City MegaKit",
    categories: ["building", "city", "environment"],
    // Street Pack is the free modular city/street kit on OGA (CC0 Quaternius).
    ogaZip: `${OGA_FILES}/Street%20Pack%20by%20%40Quaternius.zip`,
  },
  {
    id: "quaternius-modular-scifi",
    slug: "modularscifimegakit",
    title: "Modular SciFi MegaKit",
    categories: ["scifi", "environment", "prop"],
    ogaZip: `${OGA_FILES}/modular_scifi_megakitstandard.zip`,
  },
  {
    id: "quaternius-fantasy-props",
    slug: "fantasypropsmegakit",
    title: "Fantasy Props MegaKit",
    categories: ["fantasy", "prop"],
  },
  {
    id: "quaternius-base-characters",
    slug: "universalbasecharacters",
    title: "Universal Base Characters",
    categories: ["character", "rigged"],
    // OGA free dump is FBX/OBJ only — needs Pro/glTF source; scrape stays until pinned.
  },
  {
    id: "quaternius-animated-animals",
    slug: "ultimateanimatedanimals",
    title: "Ultimate Animated Animal Pack",
    categories: ["animal", "creature", "wildlife", "rigged", "animated"],
  },
  {
    id: "quaternius-monsters",
    slug: "ultimatemonsters",
    title: "Ultimate Monsters",
    categories: ["monster", "creature", "fantasy", "rigged", "animated"],
    // OGA free dump is FBX/OBJ only — needs Pro/glTF source; scrape stays until pinned.
  },
];

export const quaterniusSources: readonly AssetSource[] = QUATERNIUS_PACKS.map((pack) => ({
  id: pack.id,
  provider: "quaternius",
  title: pack.title,
  license: "CC0-1.0",
  author: "Quaternius",
  categories: pack.categories,
  download:
    pack.ogaZip !== undefined
      ? { url: pack.ogaZip }
      : { scrape: `https://quaternius.com/packs/${pack.slug}.html` },
  homepage: `https://quaternius.com/packs/${pack.slug}.html`,
  ...(pack.ogaZip !== undefined ? { mirror: pack.ogaZip } : {}),
}));
