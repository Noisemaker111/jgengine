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
