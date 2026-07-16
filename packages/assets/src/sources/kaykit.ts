import type { AssetSource } from "../manifest";

/**
 * KayKit packs are mirrored from the author's public GitHub mirrors
 * (github.com/KayKit-Game-Assets) — itch.io pages JS-gate the free download,
 * so scrape never finds a .zip. GitHub archive URLs are stable CC0 sources
 * with real `.glb` characters + props.
 */
interface KayKitPack {
  id: string;
  /** GitHub repo under KayKit-Game-Assets. */
  repo: string;
  /** itch.io homepage slug (docs / credit). */
  itch: string;
  title: string;
  categories: readonly string[];
}

const KAYKIT_PACKS: readonly KayKitPack[] = [
  {
    id: "kaykit-adventurers",
    repo: "KayKit-Character-Pack-Adventures-1.0",
    itch: "kaykit-adventurers",
    title: "KayKit Adventurers",
    categories: ["character", "rigged", "fantasy"],
  },
  {
    id: "kaykit-skeletons",
    repo: "KayKit-Character-Pack-Skeletons-1.0",
    itch: "kaykit-skeletons",
    title: "KayKit Skeletons",
    categories: ["character", "monster", "creature", "undead", "rigged", "halloween"],
  },
  {
    id: "kaykit-dungeon",
    repo: "KayKit-Dungeon-Remastered-1.0",
    itch: "kaykit-dungeon-remastered",
    title: "KayKit Dungeon (Remastered)",
    categories: ["dungeon", "environment", "prop"],
  },
  {
    id: "kaykit-medieval-hexagon",
    repo: "KayKit-Medieval-Hexagon-Pack-1.0",
    itch: "kaykit-medieval-hexagon-pack",
    title: "KayKit Medieval Hexagon Pack",
    categories: ["hexagon", "medieval", "environment"],
  },
  {
    id: "kaykit-furniture",
    repo: "KayKit-Furniture-Bits-1.0",
    itch: "kaykit-furniture-bits",
    title: "KayKit Furniture Bits",
    categories: ["furniture", "prop", "interior"],
  },
  {
    id: "kaykit-city-builder",
    repo: "KayKit-City-Builder-Bits-1.0",
    itch: "kaykit-city-builder-bits",
    title: "KayKit City Builder Bits",
    categories: ["building", "city", "environment"],
  },
  {
    id: "kaykit-space-base",
    repo: "KayKit-Space-Base-Bits-1.0",
    itch: "kaykit-space-base-bits",
    title: "KayKit Space Base Bits",
    categories: ["scifi", "environment", "prop"],
  },
];

function githubArchiveUrl(repo: string): string {
  return `https://github.com/KayKit-Game-Assets/${repo}/archive/refs/heads/main.zip`;
}

export const kaykitSources: readonly AssetSource[] = KAYKIT_PACKS.map((pack) => ({
  id: pack.id,
  provider: "kaykit",
  title: pack.title,
  license: "CC0-1.0",
  author: "Kay Lousberg",
  categories: pack.categories,
  download: { url: githubArchiveUrl(pack.repo) },
  homepage: `https://kaylousberg.itch.io/${pack.itch}`,
  mirror: githubArchiveUrl(pack.repo),
}));
