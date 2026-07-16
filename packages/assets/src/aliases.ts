import type { AssetAlias } from "./manifest";

/**
 * Semantic keys GåÆ live catalog ids. Prefer these in games so re-homes only
 * touch this table. Never point at kenney-*.
 */
export const aliases: readonly AssetAlias[] = [
  { key: "nature/tree_pine", target: "quaternius-stylized-nature/Pine_1" },
  { key: "nature/tree_common", target: "quaternius-stylized-nature/CommonTree_1" },
  { key: "nature/tree_dead", target: "quaternius-stylized-nature/DeadTree_1" },
  { key: "nature/bush", target: "quaternius-stylized-nature/Bush_Common" },
  { key: "character/rogue", target: "kaykit-adventurers/Rogue" },
  { key: "character/knight", target: "kaykit-adventurers/Knight" },
  { key: "character/mage", target: "kaykit-adventurers/Mage" },
  { key: "character/barbarian", target: "kaykit-adventurers/Barbarian" },
  { key: "scifi/alien", target: "quaternius-modular-scifi/Alien_Cyclop" },
];
