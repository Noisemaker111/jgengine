import type { AssetSource } from "../manifest";

/**
 * Quaternius megakits. The quaternius.com pack pages JS-gate the free download
 * (no `.zip` in HTML), so scrape fails in CI. Free **Standard** zips are also
 * mirrored on OpenGameArt with stable direct URLs and include a `glTF/` tree
 * (packed to `.glb` at extract). Prefer pinned OGA URLs when available.
 *
 * A pack only belongs here once its archive has been confirmed to ship `glTF/`.
 * The Street Pack, pinned here as "Downtown City MegaKit", ships Blends/FBX/OBJ
 * only — a pull found no models at all, and the wrong title made it read as a
 * solved lead for modular city facades. See `unpulled` in `manifest.ts`.
 */
interface QuaterniusPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
  /** OpenGameArt direct zip when known (Standard free pack). */
  ogaZip?: string;
  /** Why this pack contributes nothing to the index yet; see `AssetSource.unpulled`. */
  unpulled?: string;
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
    unpulled: "no OGA zip pinned; the quaternius.com page JS-gates the download, so a pull cannot resolve it",
  },
  {
    id: "quaternius-base-characters",
    slug: "universalbasecharacters",
    title: "Universal Base Characters",
    categories: ["character", "rigged"],
    unpulled: "OGA free dump is FBX/OBJ only — needs a Pro/glTF source; scrape stays until pinned",
  },
  {
    id: "quaternius-animated-animals",
    slug: "ultimateanimatedanimals",
    title: "Ultimate Animated Animal Pack",
    categories: ["animal", "creature", "wildlife", "rigged", "animated"],
    unpulled: "no OGA zip pinned; the quaternius.com page JS-gates the download, so a pull cannot resolve it",
  },
  {
    id: "quaternius-monsters",
    slug: "ultimatemonsters",
    title: "Ultimate Monsters",
    categories: ["monster", "creature", "fantasy", "rigged", "animated"],
    unpulled: "OGA free dump is FBX/OBJ only — needs a Pro/glTF source; scrape stays until pinned",
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
  ...(pack.unpulled !== undefined ? { unpulled: pack.unpulled } : {}),
}));
