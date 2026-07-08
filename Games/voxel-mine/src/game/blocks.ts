export interface HotbarSlotDef {
  id: string;
  label: string;
  kind: "tool" | "block";
}

export const PICKAXE: HotbarSlotDef = { id: "tool_pickaxe", label: "Pickaxe", kind: "tool" };

export const BLOCKS: readonly HotbarSlotDef[] = [
  { id: "block_grass", label: "Grass", kind: "block" },
  { id: "block_dirt", label: "Dirt", kind: "block" },
  { id: "block_stone", label: "Stone", kind: "block" },
  { id: "block_wood", label: "Wood", kind: "block" },
  { id: "block_leaves", label: "Leaves", kind: "block" },
  { id: "block_sand", label: "Sand", kind: "block" },
];

export const HOTBAR_ITEMS: readonly HotbarSlotDef[] = [PICKAXE, ...BLOCKS];

export const BEDROCK_BLOCK = "block_bedrock";

export interface OreDef {
  id: string;
  resourceId: string;
  label: string;
  top: number;
  bottom: number;
  rarity: number;
}

export const ORE_COAL: OreDef = {
  id: "block_ore_coal",
  resourceId: "resource_coal",
  label: "Coal",
  top: -4,
  bottom: -5,
  rarity: 0.16,
};

export const ORE_IRON: OreDef = {
  id: "block_ore_iron",
  resourceId: "resource_iron",
  label: "Iron",
  top: -6,
  bottom: -7,
  rarity: 0.11,
};

export const ORE_GOLD: OreDef = {
  id: "block_ore_gold",
  resourceId: "resource_gold",
  label: "Gold",
  top: -8,
  bottom: -8,
  rarity: 0.07,
};

export const ORE_DIAMOND: OreDef = {
  id: "block_ore_diamond",
  resourceId: "resource_diamond",
  label: "Diamond",
  top: -9,
  bottom: -9,
  rarity: 0.035,
};

export const ORES: readonly OreDef[] = [ORE_COAL, ORE_IRON, ORE_GOLD, ORE_DIAMOND];

export function oreForBlock(catalogId: string): OreDef | undefined {
  return ORES.find((ore) => ore.id === catalogId);
}

export function oreForDepth(y: number): OreDef | undefined {
  return ORES.find((ore) => y <= ore.top && y >= ore.bottom);
}

export function labelForResource(resourceId: string): string {
  return ORES.find((ore) => ore.resourceId === resourceId)?.label ?? resourceId;
}

/** Human label for anything that can land in the pack: ore resources and raw blocks alike. */
export function labelForItem(itemId: string): string {
  const ore = ORES.find((entry) => entry.resourceId === itemId);
  if (ore !== undefined) return ore.label;
  const block = HOTBAR_ITEMS.find((entry) => entry.id === itemId);
  if (block !== undefined) return block.label;
  return itemId;
}
