import type { AssetSource } from "../manifest";

interface QuaterniusPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
}

const QUATERNIUS_PACKS: readonly QuaterniusPack[] = [
  { id: "quaternius-stylized-nature", slug: "stylizednaturemegakit", title: "Stylized Nature MegaKit", categories: ["nature", "environment", "prop"] },
  { id: "quaternius-medieval-village", slug: "medievalvillagemegakit", title: "Medieval Village MegaKit", categories: ["building", "medieval", "environment"] },
  { id: "quaternius-downtown-city", slug: "downtowncitymegakit", title: "Downtown City MegaKit", categories: ["building", "city", "environment"] },
  { id: "quaternius-modular-scifi", slug: "modularscifimegakit", title: "Modular SciFi MegaKit", categories: ["scifi", "environment", "prop"] },
  { id: "quaternius-fantasy-props", slug: "fantasypropsmegakit", title: "Fantasy Props MegaKit", categories: ["fantasy", "prop"] },
  { id: "quaternius-base-characters", slug: "universalbasecharacters", title: "Universal Base Characters", categories: ["character", "rigged"] },
  { id: "quaternius-animated-animals", slug: "ultimateanimatedanimals", title: "Ultimate Animated Animal Pack", categories: ["animal", "creature", "wildlife", "rigged", "animated"] },
  { id: "quaternius-monsters", slug: "ultimatemonsters", title: "Ultimate Monsters", categories: ["monster", "creature", "fantasy", "rigged", "animated"] },
];

export const quaterniusSources: readonly AssetSource[] = QUATERNIUS_PACKS.map((pack) => ({
  id: pack.id,
  provider: "quaternius",
  title: pack.title,
  license: "CC0-1.0",
  author: "Quaternius",
  categories: pack.categories,
  download: { scrape: `https://quaternius.com/packs/${pack.slug}.html` },
  homepage: `https://quaternius.com/packs/${pack.slug}.html`,
}));
