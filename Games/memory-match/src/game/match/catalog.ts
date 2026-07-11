import type { GameIconName } from "@jgengine/react/gameIcons";

export type BoardSizeId = "4x4" | "6x6";

export type BoardSizeDef = {
  readonly id: BoardSizeId;
  readonly label: string;
  readonly rows: number;
  readonly cols: number;
  readonly pairCount: number;
};

export const BOARD_SIZES: Readonly<Record<BoardSizeId, BoardSizeDef>> = {
  "4x4": { id: "4x4", label: "4×4", rows: 4, cols: 4, pairCount: 8 },
  "6x6": { id: "6x6", label: "6×6", rows: 6, cols: 6, pairCount: 18 },
};

export const BOARD_SIZE_ORDER: readonly BoardSizeId[] = ["4x4", "6x6"];

export const DEFAULT_SIZE_ID: BoardSizeId = "4x4";

export function isBoardSizeId(value: unknown): value is BoardSizeId {
  return value === "4x4" || value === "6x6";
}

export const GLYPH_POOL: readonly GameIconName[] = [
  "sword",
  "axe",
  "bow",
  "staff",
  "shield",
  "helmet",
  "cloak",
  "torch",
  "potionRed",
  "scroll",
  "tome",
  "gem",
  "crystal",
  "coin",
  "key",
  "chest",
  "feather",
  "fire",
  "frost",
  "lightning",
  "leaf",
  "skull",
  "heart",
  "star",
];

export const GLYPH_TITLES: Readonly<Record<string, string>> = {
  sword: "Sword",
  axe: "Axe",
  bow: "Bow",
  staff: "Staff",
  shield: "Shield",
  helmet: "Helm",
  cloak: "Cloak",
  torch: "Torch",
  potionRed: "Potion",
  scroll: "Scroll",
  tome: "Tome",
  gem: "Gem",
  crystal: "Crystal",
  coin: "Coin",
  key: "Key",
  chest: "Chest",
  feather: "Feather",
  fire: "Flame",
  frost: "Frost",
  lightning: "Bolt",
  leaf: "Leaf",
  skull: "Skull",
  heart: "Heart",
  star: "Star",
};

export const MISMATCH_DELAY_SECONDS = 0.85;
export const FLIP_DURATION_MS = 420;
