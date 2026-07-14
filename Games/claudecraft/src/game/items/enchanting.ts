import type { EquipSlot, ItemDef, ItemQuality } from "../model";

export interface EnchantStatBonus {
  str?: number;
  agi?: number;
  sta?: number;
  int?: number;
  spi?: number;
  attackPower?: number;
  spellPower?: number;
  critPct?: number;
  hastePct?: number;
}

export interface EnchantReagent {
  itemId: string;
  count: number;
}

export interface EnchantDef {
  id: string;
  name: string;
  itemSlot: EquipSlot;
  reagents: readonly EnchantReagent[];
  stats: EnchantStatBonus;
}

export const ENCHANTS: readonly EnchantDef[] = [
  { id: "enchant_weapon_might", name: "Enchant Weapon: Might", itemSlot: "mainhand", reagents: [{ itemId: "arcane_dust", count: 4 }], stats: { str: 4, agi: 2 } },
  { id: "enchant_weapon_focus", name: "Enchant Weapon: Focus", itemSlot: "mainhand", reagents: [{ itemId: "arcane_dust", count: 4 }], stats: { int: 5, spi: 2 } },
  { id: "enchant_weapon_brutality", name: "Enchant Weapon: Brutality", itemSlot: "mainhand", reagents: [{ itemId: "arcane_essence", count: 3 }], stats: { attackPower: 18 } },
  { id: "enchant_weapon_sorcery", name: "Enchant Weapon: Sorcery", itemSlot: "mainhand", reagents: [{ itemId: "arcane_essence", count: 3 }], stats: { spellPower: 18 } },
  { id: "enchant_helmet_wisdom", name: "Enchant Helmet: Wisdom", itemSlot: "helmet", reagents: [{ itemId: "arcane_essence", count: 2 }], stats: { int: 4, spi: 2 } },
  { id: "enchant_shoulder_might", name: "Enchant Shoulders: Might", itemSlot: "shoulder", reagents: [{ itemId: "arcane_dust", count: 5 }], stats: { str: 3, agi: 3 } },
  { id: "enchant_chest_stamina", name: "Enchant Chest: Stamina", itemSlot: "chest", reagents: [{ itemId: "arcane_dust", count: 5 }], stats: { sta: 6 } },
  { id: "enchant_chest_greater_stats", name: "Enchant Chest: Greater Stats", itemSlot: "chest", reagents: [{ itemId: "arcane_shard", count: 2 }], stats: { sta: 8, str: 4 } },
  { id: "enchant_waist_vitality", name: "Enchant Belt: Vitality", itemSlot: "waist", reagents: [{ itemId: "arcane_dust", count: 5 }], stats: { sta: 5 } },
  { id: "enchant_legs_swiftness", name: "Enchant Legs: Swiftness", itemSlot: "legs", reagents: [{ itemId: "arcane_dust", count: 5 }], stats: { agi: 4 } },
  { id: "enchant_gloves_precision", name: "Enchant Gloves: Precision", itemSlot: "gloves", reagents: [{ itemId: "arcane_essence", count: 3 }], stats: { critPct: 1.5 } },
  { id: "enchant_feet_haste", name: "Enchant Boots: Haste", itemSlot: "feet", reagents: [{ itemId: "arcane_essence", count: 3 }], stats: { hastePct: 0.05 } },
];

const ENCHANTS_BY_ID = new Map(ENCHANTS.map((enchant) => [enchant.id, enchant]));

export function enchantById(id: string): EnchantDef | null {
  return ENCHANTS_BY_ID.get(id) ?? null;
}

export function enchantsForSlot(slot: EquipSlot): readonly EnchantDef[] {
  return ENCHANTS.filter((enchant) => enchant.itemSlot === slot);
}

const QUALITY_ORDER: readonly ItemQuality[] = ["poor", "common", "uncommon", "rare", "epic"];

export const DISENCHANT_MATERIAL_BY_QUALITY: Readonly<Record<ItemQuality, string>> = {
  poor: "arcane_dust",
  common: "arcane_dust",
  uncommon: "arcane_dust",
  rare: "arcane_essence",
  epic: "arcane_shard",
};

export function isDisenchantable(def: ItemDef | null): boolean {
  return def !== null && (def.kind === "weapon" || def.kind === "armor") && def.quality !== "poor";
}

export function disenchantYield(def: ItemDef, roll: () => number): number {
  const qualityIdx = Math.max(0, QUALITY_ORDER.indexOf(def.quality));
  const tierBonus = Math.floor((def.levelReq ?? 1) / 10);
  const bonus = roll() < 0.5 ? 0 : 1;
  return qualityIdx + tierBonus + 1 + bonus;
}

export interface AggregatedEnchant {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
  attackPower: number;
  spellPower: number;
  critPct: number;
  hastePct: number;
}

/** Sum the stat bonus of every applied enchant whose slot still has something equipped. An
 * enchant on an empty slot is dormant — it sticks to the slot, not a specific item copy, since
 * this engine's inventory is fungible-by-id rather than per-instance. */
export function aggregateEnchantBonuses(
  equips: Partial<Record<EquipSlot, string>>,
  enchants: Partial<Record<EquipSlot, string>>,
): AggregatedEnchant {
  const out: AggregatedEnchant = {
    str: 0,
    agi: 0,
    sta: 0,
    int: 0,
    spi: 0,
    attackPower: 0,
    spellPower: 0,
    critPct: 0,
    hastePct: 0,
  };
  for (const [slot, enchantId] of Object.entries(enchants) as [EquipSlot, string | undefined][]) {
    if (enchantId === undefined || equips[slot] === undefined) continue;
    const enchant = enchantById(enchantId);
    if (enchant === null || enchant.itemSlot !== slot) continue;
    const stats = enchant.stats;
    out.str += stats.str ?? 0;
    out.agi += stats.agi ?? 0;
    out.sta += stats.sta ?? 0;
    out.int += stats.int ?? 0;
    out.spi += stats.spi ?? 0;
    out.attackPower += stats.attackPower ?? 0;
    out.spellPower += stats.spellPower ?? 0;
    out.critPct += stats.critPct ?? 0;
    out.hastePct += stats.hastePct ?? 0;
  }
  return out;
}
