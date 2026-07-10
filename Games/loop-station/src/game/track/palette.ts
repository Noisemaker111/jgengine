export const VOID_COLOR = "#12101f";
export const TAPE_MAGENTA = "#e83d84";
export const LOOP_TEAL = "#12b3a8";
export const GRID_VIOLET = "#6247aa";
export const PAPER_WHITE = "#f5f2fa";

const GHOST_HUES = [
  TAPE_MAGENTA,
  LOOP_TEAL,
  "#a04dd9",
  "#e8a13d",
  "#3de8c4",
  "#e83d3d",
  "#4d7ad9",
  "#d9c74d",
  "#8fe83d",
  "#e83dc4",
  "#3d8fe8",
  "#c44de8",
] as const;

export function ghostColor(lapIndex: number): string {
  return GHOST_HUES[(lapIndex - 1) % GHOST_HUES.length]!;
}
