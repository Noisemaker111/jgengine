import { createAffixRoller, type AffixPool, type ItemBaseDef, type RarityTier } from "@jgengine/core/item/affix";
import { createItemInstanceRegistry, proceduralLootEntry } from "@jgengine/core/item/itemInstanceRegistry";

export interface RelicInstance {
  name: string;
  rarity: string;
  stats: Record<string, number>;
}

const RELIC_POOL: AffixPool = {
  id: "relic_core",
  affixes: [
    {
      id: "relic_scrap_value",
      stat: "sellValue",
      op: "add",
      roll: [10, 40],
      weight: 3,
      namePart: { position: "suffix", text: "of Salvage" },
    },
    {
      id: "relic_crit",
      stat: "critBonus",
      op: "add",
      roll: [0.01, 0.05],
      weight: 2,
      namePart: { position: "prefix", text: "Keen" },
    },
    {
      id: "relic_mag",
      stat: "magazineBonus",
      op: "add",
      roll: [1, 3],
      weight: 2,
      namePart: { position: "prefix", text: "Loaded" },
    },
  ],
};

const RELIC_RARITIES: readonly RarityTier[] = [
  { id: "common", weight: 100, affixCount: 1, statScale: 1 },
  { id: "rare", weight: 30, affixCount: 2, statScale: 1.2, namePart: "Rare" },
  { id: "legendary", weight: 5, affixCount: 3, statScale: 1.5, namePart: "Legendary" },
];

const RELIC_BASE: ItemBaseDef = { id: "relic_charm", name: "Charm", baseStats: {}, pools: ["relic_core"] };

const relicRoller = createAffixRoller({ pools: [RELIC_POOL], rarities: RELIC_RARITIES });

export const relicRegistry = createItemInstanceRegistry<RelicInstance>("relic");

export const rollRelicDrop = proceduralLootEntry(relicRegistry, (rng) => {
  const rolled = relicRoller.rollRandom(RELIC_BASE, rng);
  return { baseId: rolled.baseId, def: { name: rolled.name, rarity: rolled.rarity, stats: rolled.stats } };
});

export function relicById(itemId: string): RelicInstance | undefined {
  return relicRegistry.get(itemId);
}
