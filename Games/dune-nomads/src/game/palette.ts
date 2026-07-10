export const DUNE_GOLD = "#e0b878";
export const SHADOW_OCHRE = "#a8763e";
export const OASIS_GREEN = "#3e8c6f";
export const INDIGO_ROBE = "#33418c";
export const PALE_SUN = "#f2d3a0";

export const PANEL_BG = "#241a10";
export const PANEL_BORDER = "#5c4526";
export const INK = "#f4e6cc";
export const INK_DIM = "#c9ac82";
export const DANGER_RED = "#c24a3a";
export const RIVAL_RED = "#b0503c";

export function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}
