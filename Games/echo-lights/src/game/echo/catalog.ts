export type PadIndex = 0 | 1 | 2 | 3;

export type EchoMode = "classic" | "practice";

export type PadDef = {
  readonly id: string;
  readonly label: string;
  readonly action: string;
  readonly base: string;
  readonly baseDeep: string;
  readonly lit: string;
  readonly glow: string;
  readonly corner: string;
};

export const PADS: readonly [PadDef, PadDef, PadDef, PadDef] = [
  {
    id: "green",
    label: "Green",
    action: "padGreen",
    base: "#0f8a45",
    baseDeep: "#0a5c2f",
    lit: "#52ff9c",
    glow: "rgba(82, 255, 156, 0.6)",
    corner: "100% 10% 10% 10%",
  },
  {
    id: "red",
    label: "Red",
    action: "padRed",
    base: "#bb2330",
    baseDeep: "#7d161f",
    lit: "#ff5d69",
    glow: "rgba(255, 93, 105, 0.6)",
    corner: "10% 100% 10% 10%",
  },
  {
    id: "yellow",
    label: "Yellow",
    action: "padYellow",
    base: "#c69207",
    baseDeep: "#8a6504",
    lit: "#ffdf57",
    glow: "rgba(255, 223, 87, 0.6)",
    corner: "10% 10% 10% 100%",
  },
  {
    id: "blue",
    label: "Blue",
    action: "padBlue",
    base: "#1d59bd",
    baseDeep: "#123c82",
    lit: "#5fadff",
    glow: "rgba(95, 173, 255, 0.6)",
    corner: "10% 10% 100% 10%",
  },
];

export const PAD_COUNT = 4;

export function isPadIndex(value: unknown): value is PadIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function isEchoMode(value: unknown): value is EchoMode {
  return value === "classic" || value === "practice";
}

export const SPEED_UP_LENGTHS: readonly [number, number, number] = [5, 9, 13];

export type TierTiming = { readonly lit: number; readonly gap: number };

export const TIER_TIMING: readonly [TierTiming, TierTiming, TierTiming, TierTiming] = [
  { lit: 0.55, gap: 0.18 },
  { lit: 0.42, gap: 0.14 },
  { lit: 0.32, gap: 0.11 },
  { lit: 0.24, gap: 0.08 },
];

export function speedTier(length: number): 0 | 1 | 2 | 3 {
  if (length >= SPEED_UP_LENGTHS[2]) return 3;
  if (length >= SPEED_UP_LENGTHS[1]) return 2;
  if (length >= SPEED_UP_LENGTHS[0]) return 1;
  return 0;
}

export const START_DELAY_SECONDS = 0.85;
export const ADVANCE_DELAY_SECONDS = 0.9;
export const REPLAY_DELAY_SECONDS = 1.15;
export const PRESS_FLASH_SECONDS = 0.3;
export const MISS_FLASH_SECONDS = 0.7;
