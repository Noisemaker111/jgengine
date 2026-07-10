import type { AssetSource } from "../manifest";

interface KayKitPack {
  id: string;
  slug: string;
  title: string;
  categories: readonly string[];
}

const KAYKIT_PACKS: readonly KayKitPack[] = [
  { id: "kaykit-adventurers", slug: "kaykit-adventurers", title: "KayKit Adventurers", categories: ["character", "rigged", "fantasy"] },
  { id: "kaykit-skeletons", slug: "kaykit-skeletons", title: "KayKit Skeletons", categories: ["character", "monster", "creature", "undead", "rigged", "halloween"] },
  { id: "kaykit-dungeon", slug: "kaykit-dungeon-remastered", title: "KayKit Dungeon (Remastered)", categories: ["dungeon", "environment", "prop"] },
  { id: "kaykit-medieval-hexagon", slug: "kaykit-medieval-hexagon-pack", title: "KayKit Medieval Hexagon Pack", categories: ["hexagon", "medieval", "environment"] },
];

export const kaykitSources: readonly AssetSource[] = KAYKIT_PACKS.map((pack) => ({
  id: pack.id,
  provider: "kaykit",
  title: pack.title,
  license: "CC0-1.0",
  author: "Kay Lousberg",
  categories: pack.categories,
  download: { scrape: `https://kaylousberg.itch.io/${pack.slug}` },
  homepage: `https://kaylousberg.itch.io/${pack.slug}`,
}));
