import type { AssetAlias } from "./manifest";

/**
 * Semantic keys → live catalog ids. Prefer these in games so re-homes only
 * touch this table. Never point at kenney-*.
 */
export const aliases: readonly AssetAlias[] = [
  { key: "nature/tree_pine", target: "quaternius-stylized-nature/Pine_1" },
  { key: "nature/tree_common", target: "quaternius-stylized-nature/CommonTree_1" },
  { key: "nature/tree_dead", target: "quaternius-stylized-nature/DeadTree_1" },
  { key: "nature/bush", target: "quaternius-stylized-nature/Bush_Common" },
  { key: "nature/rock", target: "quaternius-stylized-nature/Rock_Medium_1" },
  { key: "character/rogue", target: "kaykit-adventurers/Rogue" },
  { key: "character/knight", target: "kaykit-adventurers/Knight" },
  { key: "character/mage", target: "kaykit-adventurers/Mage" },
  { key: "character/barbarian", target: "kaykit-adventurers/Barbarian" },
  { key: "scifi/alien", target: "quaternius-modular-scifi/Alien_Cyclop" },
  { key: "scifi/chest", target: "quaternius-modular-scifi/Prop_Chest" },
  { key: "scifi/crate", target: "quaternius-modular-scifi/Prop_Crate3" },
  { key: "scifi/computer", target: "quaternius-modular-scifi/Prop_Computer" },
  { key: "dungeon/chest", target: "kaykit-dungeon/chest" },
  { key: "furniture/bed", target: "kaykit-furniture/bed_double_A" },
  { key: "furniture/couch", target: "kaykit-furniture/couch" },
  { key: "furniture/table", target: "kaykit-furniture/table_medium" },
];
