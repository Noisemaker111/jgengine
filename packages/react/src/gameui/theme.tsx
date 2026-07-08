import { createContext, useContext, type ReactNode } from "react";

export interface GameUiRarityColors {
  common: string;
  uncommon: string;
  rare: string;
  epic: string;
  legendary: string;
}

export interface GameUiTheme {
  name: string;
  accent: string;
  accentGlow: string;
  accentDeep: string;
  surface: string;
  surfaceDeep: string;
  edge: string;
  edgeBright: string;
  textPrimary: string;
  textDim: string;
  health: string;
  healthDeep: string;
  mana: string;
  manaDeep: string;
  stamina: string;
  staminaDeep: string;
  xp: string;
  xpDeep: string;
  shield: string;
  shieldDeep: string;
  danger: string;
  warning: string;
  success: string;
  hostile: string;
  friendly: string;
  neutral: string;
  rarity: GameUiRarityColors;
  fontDisplay: string;
  fontNumeric: string;
  fontBody: string;
}

export const emberTheme: GameUiTheme = {
  name: "ember",
  accent: "#e3b054",
  accentGlow: "rgba(227, 176, 84, 0.55)",
  accentDeep: "#8a6425",
  surface: "#17120d",
  surfaceDeep: "#0b0906",
  edge: "#57452c",
  edgeBright: "#93794c",
  textPrimary: "#f2e7d0",
  textDim: "#a3947a",
  health: "#5cc35f",
  healthDeep: "#26662c",
  mana: "#4a86d8",
  manaDeep: "#20406f",
  stamina: "#d9c33f",
  staminaDeep: "#6e621c",
  xp: "#a566d9",
  xpDeep: "#4e2c6e",
  shield: "#9fb9c9",
  shieldDeep: "#48606e",
  danger: "#e0483e",
  warning: "#e8a33d",
  success: "#6fce6f",
  hostile: "#d84a3a",
  friendly: "#4fa9e0",
  neutral: "#d9d04f",
  rarity: {
    common: "#b4b2a8",
    uncommon: "#57c14f",
    rare: "#4a86d8",
    epic: "#a04fd0",
    legendary: "#e0862e",
  },
  fontDisplay: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  fontNumeric: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
  fontBody: '"Segoe UI", system-ui, sans-serif',
};

export const synthwaveTheme: GameUiTheme = {
  name: "synthwave",
  accent: "#41e6f0",
  accentGlow: "rgba(65, 230, 240, 0.55)",
  accentDeep: "#136b74",
  surface: "#12101f",
  surfaceDeep: "#080711",
  edge: "#3c3467",
  edgeBright: "#6a5daa",
  textPrimary: "#e9ecff",
  textDim: "#8d8bb3",
  health: "#3ee08a",
  healthDeep: "#136b44",
  mana: "#5a7bff",
  manaDeep: "#243487",
  stamina: "#f0e341",
  staminaDeep: "#77701a",
  xp: "#e050d8",
  xpDeep: "#6e2069",
  shield: "#8ad4f0",
  shieldDeep: "#2f6d85",
  danger: "#ff4d6a",
  warning: "#ffb347",
  success: "#3ee08a",
  hostile: "#ff4d6a",
  friendly: "#41e6f0",
  neutral: "#f0e341",
  rarity: {
    common: "#9fa4bd",
    uncommon: "#3ee08a",
    rare: "#5a7bff",
    epic: "#e050d8",
    legendary: "#ffb347",
  },
  fontDisplay: '"Segoe UI", system-ui, sans-serif',
  fontNumeric: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
  fontBody: '"Segoe UI", system-ui, sans-serif',
};

export const fieldkitTheme: GameUiTheme = {
  name: "fieldkit",
  accent: "#d8c169",
  accentGlow: "rgba(216, 193, 105, 0.45)",
  accentDeep: "#6e6230",
  surface: "#14160f",
  surfaceDeep: "#0a0b07",
  edge: "#454a35",
  edgeBright: "#6f7657",
  textPrimary: "#e6e8d8",
  textDim: "#95997f",
  health: "#7fb84a",
  healthDeep: "#3d5c1f",
  mana: "#57a8b8",
  manaDeep: "#265059",
  stamina: "#c9b73e",
  staminaDeep: "#645a1c",
  xp: "#b88f4a",
  xpDeep: "#5c451f",
  shield: "#a8b4a0",
  shieldDeep: "#4e594a",
  danger: "#d84f35",
  warning: "#d8952f",
  success: "#7fb84a",
  hostile: "#d84f35",
  friendly: "#57a8b8",
  neutral: "#c9b73e",
  rarity: {
    common: "#a8ab99",
    uncommon: "#7fb84a",
    rare: "#57a8b8",
    epic: "#b06fc9",
    legendary: "#d8952f",
  },
  fontDisplay: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif',
  fontNumeric: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
  fontBody: '"Segoe UI", system-ui, sans-serif',
};

const GameUiThemeContext = createContext<GameUiTheme>(emberTheme);

export function GameUiThemeProvider({ theme, children }: { theme: GameUiTheme; children: ReactNode }) {
  return <GameUiThemeContext.Provider value={theme}>{children}</GameUiThemeContext.Provider>;
}

export function useGameUiTheme(): GameUiTheme {
  return useContext(GameUiThemeContext);
}

export type VitalTone = "health" | "mana" | "stamina" | "xp" | "shield";

export function vitalColors(theme: GameUiTheme, tone: VitalTone): { fill: string; deep: string } {
  switch (tone) {
    case "health":
      return { fill: theme.health, deep: theme.healthDeep };
    case "mana":
      return { fill: theme.mana, deep: theme.manaDeep };
    case "stamina":
      return { fill: theme.stamina, deep: theme.staminaDeep };
    case "xp":
      return { fill: theme.xp, deep: theme.xpDeep };
    case "shield":
      return { fill: theme.shield, deep: theme.shieldDeep };
  }
}

export type RarityTierName = keyof GameUiRarityColors;

export function rarityColor(theme: GameUiTheme, rarity: RarityTierName | undefined): string {
  if (rarity === undefined) return theme.rarity.common;
  return theme.rarity[rarity];
}
