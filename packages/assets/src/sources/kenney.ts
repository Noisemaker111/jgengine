import type { AssetSource } from "../manifest";

interface KenneyPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
}

const KENNEY_PACKS: readonly KenneyPack[] = [
  { id: "kenney-furniture", slug: "furniture-kit", title: "Furniture Kit", categories: ["furniture", "interior", "prop"] },
  { id: "kenney-mini-characters", slug: "mini-characters", title: "Mini Characters", categories: ["character", "rigged"] },
  { id: "kenney-nature", slug: "nature-kit", title: "Nature Kit", categories: ["nature", "environment", "prop"] },
  { id: "kenney-castle", slug: "castle-kit", title: "Castle Kit", categories: ["building", "medieval", "environment"] },
  { id: "kenney-city-commercial", slug: "city-kit-commercial", title: "City Kit (Commercial)", categories: ["building", "city", "environment"] },
  { id: "kenney-city-suburban", slug: "city-kit-suburban", title: "City Kit (Suburban)", categories: ["building", "city", "environment"] },
  { id: "kenney-city-roads", slug: "city-kit-roads", title: "City Kit (Roads)", categories: ["road", "city", "environment"] },
  { id: "kenney-fantasy-town", slug: "fantasy-town-kit", title: "Fantasy Town Kit", categories: ["building", "fantasy", "environment"] },
  { id: "kenney-graveyard", slug: "graveyard-kit", title: "Graveyard Kit", categories: ["environment", "halloween", "prop"] },
  { id: "kenney-holiday", slug: "holiday-kit", title: "Holiday Kit", categories: ["prop", "holiday", "environment"] },
  { id: "kenney-mini-arena", slug: "mini-arena", title: "Mini Arena", categories: ["character", "arena", "prop"] },
  { id: "kenney-mini-dungeon", slug: "mini-dungeon", title: "Mini Dungeon", categories: ["dungeon", "environment", "prop"] },
  { id: "kenney-mini-skate", slug: "mini-skate", title: "Mini Skate", categories: ["character", "vehicle", "prop"] },
  { id: "kenney-pirate", slug: "pirate-kit", title: "Pirate Kit", categories: ["ship", "pirate", "environment"] },
  { id: "kenney-platformer", slug: "platformer-kit", title: "Platformer Kit", categories: ["platform", "environment", "prop"] },
  { id: "kenney-prototype", slug: "prototype-kit", title: "Prototype Kit", categories: ["prototype", "environment"] },
  { id: "kenney-racing", slug: "racing-kit", title: "Racing Kit", categories: ["vehicle", "racing", "environment"] },
  { id: "kenney-space", slug: "space-kit", title: "Space Kit", categories: ["space", "vehicle", "prop"] },
  { id: "kenney-survival", slug: "survival-kit", title: "Survival Kit", categories: ["survival", "prop", "environment"] },
  { id: "kenney-tower-defense", slug: "tower-defense-kit", title: "Tower Defense Kit", categories: ["tower", "environment", "prop"] },
  { id: "kenney-food", slug: "food-kit", title: "Food Kit", categories: ["food", "prop"] },
  { id: "kenney-blaster", slug: "blaster-kit", title: "Blaster Kit", categories: ["weapon", "prop"] },
  { id: "kenney-furniture", slug: "furniture-kit", title: "Furniture Kit", categories: ["furniture", "interior", "prop"] },
  { id: "kenney-mini-characters", slug: "mini-characters", title: "Mini Characters", categories: ["character", "prop"] },
];

export const kenneySources: readonly AssetSource[] = KENNEY_PACKS.map((pack) => ({
  id: pack.id,
  provider: "kenney",
  title: pack.title,
  license: "CC0-1.0",
  author: "Kenney",
  categories: pack.categories,
  download: { scrape: `https://kenney.nl/assets/${pack.slug}` },
  homepage: `https://kenney.nl/assets/${pack.slug}`,
}));
