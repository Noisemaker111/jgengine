import { buildCatalog } from "@jgengine/assets/catalogs/build";
import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";

/** Preferred CC0 packs for this game — pull + reindex to light up MODEL_PLAN ids. */
export const assets: AssetCatalog = buildCatalog({
  basePath: "/models",
  sources: [
    "quaternius-modular-scifi",
    "quaternius-stylized-nature",
    "quaternius-fantasy-props",
    "quaternius-base-characters",
    "kaykit-adventurers",
  ],
});

export const FAMILY_COLORS: Record<string, { body: string; accent: string }> = {
  psycho: { body: "#c96f3b", accent: "#e23c2e" },
  marauder: { body: "#6f5a3e", accent: "#8a4a2e" },
  nomad: { body: "#7a6a4a", accent: "#4e4436" },
  skag_pup: { body: "#b09a72", accent: "#7d6844" },
  skag: { body: "#9a8258", accent: "#6b5636" },
  badass_skag: { body: "#7d6844", accent: "#a33c28" },
  badass_psycho: { body: "#a34a2c", accent: "#ffb400" },
  captain_rusk: { body: "#5a4a66", accent: "#ff7a1a" },
  bullymong_brat: { body: "#8a9aa8", accent: "#5a6a78" },
  bullymong: { body: "#71828f", accent: "#3f4c58" },
  spiderant: { body: "#b08a4a", accent: "#6e5426" },
  spiderant_soldier: { body: "#96702a", accent: "#ffb400" },
  loader: { body: "#c9a23a", accent: "#e23c2e" },
  loader_war: { body: "#a8842c", accent: "#ff7a1a" },
  badass_loader: { body: "#8a6a1e", accent: "#3fc9ff" },
  bad_maw: { body: "#7d5a3c", accent: "#e23c2e" },
  the_warrior: { body: "#8a2f1e", accent: "#ff9a00" },
};

export const NPC_STYLES: Record<string, { coat: string }> = {
  dr_sparx: { coat: "#d8d4c8" },
  rigg: { coat: "#8a6a1e" },
  gauge: { coat: "#3a4a5e" },
};
