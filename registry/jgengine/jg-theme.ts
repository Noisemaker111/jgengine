import type { CSSProperties } from "react";

export type JgThemeVars = CSSProperties & Record<`--jg-${string}`, string>;

export const emberVars: JgThemeVars = {
  "--jg-accent": "#e3b054",
  "--jg-accent-glow": "rgba(227, 176, 84, 0.55)",
  "--jg-accent-deep": "#8a6425",
  "--jg-surface": "#17120d",
  "--jg-surface-deep": "#0b0906",
  "--jg-edge": "#57452c",
  "--jg-edge-bright": "#93794c",
  "--jg-text": "#f2e7d0",
  "--jg-text-dim": "#a3947a",
  "--jg-health": "#5cc35f",
  "--jg-health-deep": "#26662c",
  "--jg-mana": "#4a86d8",
  "--jg-mana-deep": "#20406f",
  "--jg-stamina": "#d9c33f",
  "--jg-stamina-deep": "#6e621c",
  "--jg-xp": "#a566d9",
  "--jg-xp-deep": "#4e2c6e",
  "--jg-shield": "#9fb9c9",
  "--jg-shield-deep": "#48606e",
  "--jg-danger": "#e0483e",
  "--jg-warning": "#e8a33d",
  "--jg-success": "#6fce6f",
  "--jg-hostile": "#d84a3a",
  "--jg-friendly": "#4fa9e0",
  "--jg-neutral": "#d9d04f",
  "--jg-font-display": "\"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, serif",
  "--jg-font-numeric": "Consolas, \"Cascadia Mono\", \"SF Mono\", \"Roboto Mono\", monospace",
  "--jg-font-body": "\"Segoe UI\", system-ui, sans-serif",
  "--jg-rarity-common": "#b4b2a8",
  "--jg-rarity-uncommon": "#57c14f",
  "--jg-rarity-rare": "#4a86d8",
  "--jg-rarity-epic": "#a04fd0",
  "--jg-rarity-legendary": "#e0862e",
};

export const synthwaveVars: JgThemeVars = {
  "--jg-accent": "#41e6f0",
  "--jg-accent-glow": "rgba(65, 230, 240, 0.55)",
  "--jg-accent-deep": "#136b74",
  "--jg-surface": "#12101f",
  "--jg-surface-deep": "#080711",
  "--jg-edge": "#3c3467",
  "--jg-edge-bright": "#6a5daa",
  "--jg-text": "#e9ecff",
  "--jg-text-dim": "#8d8bb3",
  "--jg-health": "#3ee08a",
  "--jg-health-deep": "#136b44",
  "--jg-mana": "#5a7bff",
  "--jg-mana-deep": "#243487",
  "--jg-stamina": "#f0e341",
  "--jg-stamina-deep": "#77701a",
  "--jg-xp": "#e050d8",
  "--jg-xp-deep": "#6e2069",
  "--jg-shield": "#8ad4f0",
  "--jg-shield-deep": "#2f6d85",
  "--jg-danger": "#ff4d6a",
  "--jg-warning": "#ffb347",
  "--jg-success": "#3ee08a",
  "--jg-hostile": "#ff4d6a",
  "--jg-friendly": "#41e6f0",
  "--jg-neutral": "#f0e341",
  "--jg-font-display": "\"Segoe UI\", system-ui, sans-serif",
  "--jg-font-numeric": "Consolas, \"Cascadia Mono\", \"SF Mono\", \"Roboto Mono\", monospace",
  "--jg-font-body": "\"Segoe UI\", system-ui, sans-serif",
  "--jg-rarity-common": "#9fa4bd",
  "--jg-rarity-uncommon": "#3ee08a",
  "--jg-rarity-rare": "#5a7bff",
  "--jg-rarity-epic": "#e050d8",
  "--jg-rarity-legendary": "#ffb347",
};

export const fieldkitVars: JgThemeVars = {
  "--jg-accent": "#d8c169",
  "--jg-accent-glow": "rgba(216, 193, 105, 0.45)",
  "--jg-accent-deep": "#6e6230",
  "--jg-surface": "#14160f",
  "--jg-surface-deep": "#0a0b07",
  "--jg-edge": "#454a35",
  "--jg-edge-bright": "#6f7657",
  "--jg-text": "#e6e8d8",
  "--jg-text-dim": "#95997f",
  "--jg-health": "#7fb84a",
  "--jg-health-deep": "#3d5c1f",
  "--jg-mana": "#57a8b8",
  "--jg-mana-deep": "#265059",
  "--jg-stamina": "#c9b73e",
  "--jg-stamina-deep": "#645a1c",
  "--jg-xp": "#b88f4a",
  "--jg-xp-deep": "#5c451f",
  "--jg-shield": "#a8b4a0",
  "--jg-shield-deep": "#4e594a",
  "--jg-danger": "#d84f35",
  "--jg-warning": "#d8952f",
  "--jg-success": "#7fb84a",
  "--jg-hostile": "#d84f35",
  "--jg-friendly": "#57a8b8",
  "--jg-neutral": "#c9b73e",
  "--jg-font-display": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-font-numeric": "Consolas, \"Cascadia Mono\", \"SF Mono\", \"Roboto Mono\", monospace",
  "--jg-font-body": "\"Segoe UI\", system-ui, sans-serif",
  "--jg-rarity-common": "#a8ab99",
  "--jg-rarity-uncommon": "#7fb84a",
  "--jg-rarity-rare": "#57a8b8",
  "--jg-rarity-epic": "#b06fc9",
  "--jg-rarity-legendary": "#d8952f",
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mix(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function alpha(hex: string, value: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

export interface JgThemeSeed {
  accent: string;
  surface: string;
  text?: string;
  health?: string;
  mana?: string;
  stamina?: string;
  xp?: string;
  shield?: string;
  danger?: string;
  warning?: string;
  friendly?: string;
  fontDisplay?: string;
}

export function deriveJgTheme(seed: JgThemeSeed): JgThemeVars {
  const accent = seed.accent;
  const surface = seed.surface;
  const text = seed.text ?? mix("#f4f4f0", accent, 0.12);
  const health = seed.health ?? "#e0483e";
  const mana = seed.mana ?? "#4a86d8";
  const stamina = seed.stamina ?? "#d9c33f";
  const xp = seed.xp ?? "#a566d9";
  const shield = seed.shield ?? "#9fb9c9";
  const danger = seed.danger ?? "#e0483e";
  const warning = seed.warning ?? "#e8a33d";
  return {
    "--jg-accent": accent,
    "--jg-accent-glow": alpha(accent, 0.5),
    "--jg-accent-deep": mix(accent, "#000000", 0.55),
    "--jg-surface": surface,
    "--jg-surface-deep": mix(surface, "#000000", 0.5),
    "--jg-edge": mix(surface, accent, 0.22),
    "--jg-edge-bright": mix(surface, accent, 0.42),
    "--jg-text": text,
    "--jg-text-dim": mix(text, surface, 0.42),
    "--jg-health": health,
    "--jg-health-deep": mix(health, "#000000", 0.5),
    "--jg-mana": mana,
    "--jg-mana-deep": mix(mana, "#000000", 0.5),
    "--jg-stamina": stamina,
    "--jg-stamina-deep": mix(stamina, "#000000", 0.5),
    "--jg-xp": xp,
    "--jg-xp-deep": mix(xp, "#000000", 0.5),
    "--jg-shield": shield,
    "--jg-shield-deep": mix(shield, "#000000", 0.5),
    "--jg-danger": danger,
    "--jg-warning": warning,
    "--jg-success": accent,
    "--jg-hostile": danger,
    "--jg-friendly": seed.friendly ?? mana,
    "--jg-neutral": stamina,
    "--jg-rarity-common": "#b4b2a8",
    "--jg-rarity-uncommon": "#7fb84a",
    "--jg-rarity-rare": "#4a86d8",
    "--jg-rarity-epic": "#a04fd0",
    "--jg-rarity-legendary": "#e0862e",
    "--jg-font-display": seed.fontDisplay ?? '"Segoe UI", system-ui, sans-serif',
    "--jg-font-numeric": 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
    "--jg-font-body": '"Segoe UI", system-ui, sans-serif',
  };
}
