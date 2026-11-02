import type { AssetSource } from "../manifest";

/**
 * KayKit packs come from the author's public GitHub mirrors (github.com/KayKit-Game-Assets)
 * where one exists: stable CC0 archives with real `.glb` characters and props. Packs with no
 * GitHub mirror take their free itch.io upload through the page's own download flow.
 */
interface KayKitPack {
  id: string;
  /** GitHub repo under KayKit-Game-Assets; packs without one download their free upload from itch.io. */
  repo?: string;
  /** Title of the free itch.io upload, for packs with no GitHub repo. */
  itchUpload?: string;
  /** itch.io homepage slug (docs / credit). */
  itch: string;
  title: string;
  categories: readonly string[];
  /** Why this pack contributes nothing to the index yet; see `AssetSource.unpulled`. */
  unpulled?: string;
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
    unpulled: "catalogued for on-demand pull; no game needs hex tiles yet",
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
  {
    id: "kaykit-halloween",
    repo: "KayKit-Halloween-Bits-1.0",
    itch: "kaykit-halloween-bits",
    title: "KayKit Halloween Bits",
    categories: ["halloween", "prop", "environment"],
    unpulled: "listed in the asset library from its repository tree; reindex after the first pull",
  },
  {
    id: "kaykit-prototype",
    repo: "KayKit-Prototype-Bits-1.0",
    itch: "kaykit-prototype-bits",
    title: "KayKit Prototype Bits",
    categories: ["prototype", "prop", "blockout"],
    unpulled: "listed in the asset library from its repository tree; reindex after the first pull",
  },
  {
    id: "kaykit-restaurant",
    repo: "KayKit-Restaurant-Bits-1.0",
    itch: "kaykit-restaurant-bits",
    title: "KayKit Restaurant Bits",
    categories: ["restaurant", "food", "prop", "interior"],
    unpulled: "listed in the asset library from its repository tree; reindex after the first pull",
  },
  {
    id: "kaykit-forest",
    itchUpload: "Free",
    itch: "kaykit-forest",
    title: "KayKit Forest Nature Pack",
    categories: ["nature", "tree", "rock", "plant", "environment"],
  },
];

function githubArchiveUrl(repo: string): string {
  return `https://github.com/KayKit-Game-Assets/${repo}/archive/refs/heads/main.zip`;
}

export const kaykitSources: readonly AssetSource[] = KAYKIT_PACKS.map((pack): AssetSource => {
  const homepage = `https://kaylousberg.itch.io/${pack.itch}`;
  return {
    id: pack.id,
    provider: "kaykit",
    title: pack.title,
    license: "CC0-1.0",
    author: "Kay Lousberg",
    categories: pack.categories,
    download: pack.repo !== undefined ? { url: githubArchiveUrl(pack.repo) } : { itch: homepage, upload: pack.itchUpload ?? "Free" },
    homepage,
    ...(pack.repo !== undefined ? { mirror: githubArchiveUrl(pack.repo) } : {}),
    ...(pack.unpulled !== undefined ? { unpulled: pack.unpulled } : {}),
  };
});
