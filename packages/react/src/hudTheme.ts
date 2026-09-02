import { type CSSProperties } from "react";
import { hudSkinVars, type HudSkin } from "./hudSkin";
export { hudSkinVars, type HudSkin } from "./hudSkin";

/**
 * `HudTheme` (#1034, #1573): one token object that restyles every shared token-driven building
 * block at once — the atomic bars (#1033), frames, slots, the minimap ring, and the chrome the
 * registry blocks read (surfaces, edges, text, status colors, fonts, rarity). `hudThemeVars(theme)`
 * emits the whole `--jg-*` vocabulary, so setting a **game-authored** theme on any HUD ancestor
 * re-skins `packages/react` primitives and `registry/jgengine` components together. Purely CSS-token
 * driven (no image assets). Tokens are not a finished UI: every game still owns composition, skin,
 * and art direction (see AGENTS.md). Built-in presets are demo/scaffold starting points only.
 *
 * @capability hud-theme game-authored token object covering bars, frames, slots, chrome, text, status colors, fonts, and rarity
 */

/** Per-readout fill colors plus a shared accent/glow. Each `*Deep` is the shaded companion fill. */
export interface HudThemePalette {
  health: string;
  healthLow: string;
  healthDeep: string;
  mana: string;
  manaDeep: string;
  stamina: string;
  staminaDeep: string;
  shield: string;
  shieldDeep: string;
  xp: string;
  xpDeep: string;
  soul: string;
  ammo: string;
  boss: string;
  /** Accent used for glow/keycap/active states. */
  accent: string;
  /** Shaded accent for gradients and pressed states. */
  accentDeep: string;
  /** Translucent accent for outer glows. */
  accentGlow: string;
  /** Soft accent wash for large background gradients. */
  accentDim: string;
}

/** Chrome surfaces, edges, and text — what panels, overlays, and menus are built out of. */
export interface HudThemeSurface {
  surface: string;
  surfaceDeep: string;
  edge: string;
  edgeBright: string;
  text: string;
  textDim: string;
  /** Full-screen dim behind modals and overlays. */
  backdrop: string;
}

/** Semantic status colors — outcome, threat, and relationship coloring. */
export interface HudThemeStatus {
  danger: string;
  warning: string;
  success: string;
  hostile: string;
  friendly: string;
  neutral: string;
}

/** Typography roles. Any CSS `font-family` list. */
export interface HudThemeFont {
  display: string;
  numeric: string;
  body: string;
}

/** Item-rarity coloring shared by loot cards, tooltips, and inventory slots. */
export interface HudThemeRarity {
  common: string;
  uncommon: string;
  rare: string;
  epic: string;
  legendary: string;
}

/** Frame material + shape tokens (panels, `HudFrame variation="themed"`). */
export interface HudThemeFrame {
  /** Panel background (gradient or solid). */
  bg: string;
  border: string;
  /** Corner radius (any CSS length, e.g. `"10px"`, `"0"`). */
  radius: string;
  /** Outer glow / drop shadow. */
  glow: string;
}

/** Framed-trough tokens shared by every atomic bar. */
export interface HudThemeBar {
  track: string;
  frame: string;
  height: string;
  radius: string;
  bevel: string;
  text: string;
}

/** Action/inventory slot tokens. */
export interface HudThemeSlot {
  bg: string;
  border: string;
  radius: string;
}

/** A full HUD theme. Author one with {@link hudTheme} or {@link deriveHudTheme}. */
export interface HudTheme {
  palette: HudThemePalette;
  surface: HudThemeSurface;
  status: HudThemeStatus;
  font: HudThemeFont;
  rarity: HudThemeRarity;
  frame: HudThemeFrame;
  bar: HudThemeBar;
  slot: HudThemeSlot;
  /** Minimap chrome ring color. */
  ring: string;
  skin?: HudSkin;
}

/** Emits the CSS custom properties for a theme — spread onto any HUD ancestor to re-skin the subtree. */
export function hudThemeVars(theme: HudTheme): CSSProperties {
  const { palette, surface, status, font, rarity, frame, bar, slot } = theme;
  return {
    "--jg-frame-image": "none",
    "--jg-frame-slice": "0",
    "--jg-frame-scale": "1",
    "--jg-frame-fill": "stretch",
    "--jg-slot-image": "none",
    "--jg-slot-slice": "0",
    "--jg-slot-scale": "1",
    "--jg-bar-skin-track": "none",
    "--jg-bar-skin-fill": "none",
    "--jg-skin-cursor": "auto",
    ...hudSkinVars(theme.skin),
    // atomic-bar tokens (same names the bars read — #1033)
    "--jg-health": palette.health,
    "--jg-health-low": palette.healthLow,
    "--jg-health-deep": palette.healthDeep,
    "--jg-mana": palette.mana,
    "--jg-mana-deep": palette.manaDeep,
    "--jg-stamina": palette.stamina,
    "--jg-stamina-deep": palette.staminaDeep,
    "--jg-shield": palette.shield,
    "--jg-shield-deep": palette.shieldDeep,
    "--jg-xp": palette.xp,
    "--jg-xp-deep": palette.xpDeep,
    "--jg-soul": palette.soul,
    "--jg-ammo": palette.ammo,
    "--jg-boss": palette.boss,
    "--jg-bar-track": bar.track,
    "--jg-bar-frame": bar.frame,
    "--jg-bar-height": bar.height,
    "--jg-bar-radius": bar.radius,
    "--jg-bar-bevel": bar.bevel,
    "--jg-bar-text": bar.text,
    // shared chrome tokens
    "--jg-accent": palette.accent,
    "--jg-accent-deep": palette.accentDeep,
    "--jg-accent-glow": palette.accentGlow,
    "--jg-accent-dim": palette.accentDim,
    "--jg-surface": surface.surface,
    "--jg-surface-deep": surface.surfaceDeep,
    "--jg-edge": surface.edge,
    "--jg-edge-bright": surface.edgeBright,
    "--jg-text": surface.text,
    "--jg-text-dim": surface.textDim,
    "--jg-backdrop": surface.backdrop,
    "--jg-danger": status.danger,
    "--jg-warning": status.warning,
    "--jg-success": status.success,
    "--jg-hostile": status.hostile,
    "--jg-friendly": status.friendly,
    "--jg-neutral": status.neutral,
    "--jg-font-display": font.display,
    "--jg-font-numeric": font.numeric,
    "--jg-font-body": font.body,
    "--jg-rarity-common": rarity.common,
    "--jg-rarity-uncommon": rarity.uncommon,
    "--jg-rarity-rare": rarity.rare,
    "--jg-rarity-epic": rarity.epic,
    "--jg-rarity-legendary": rarity.legendary,
    "--jg-frame-bg": frame.bg,
    "--jg-frame-border": frame.border,
    "--jg-frame-radius": frame.radius,
    "--jg-frame-glow": frame.glow,
    "--jg-slot-bg": slot.bg,
    "--jg-slot-border": slot.border,
    "--jg-slot-radius": slot.radius,
    "--jg-ring": theme.ring,
  } as CSSProperties;
}

/** Default theme tokens for previews/scaffold — not a finished game look; author a custom theme. */
export const defaultHudTheme: HudTheme = {
  palette: {
    health: "#e5484d",
    healthLow: "#b21e23",
    mana: "#3b82f6",
    stamina: "#84cc16",
    shield: "#22d3ee",
    xp: "#a855f7",
    soul: "#c084fc",
    ammo: "#f8b84e",
    boss: "#ef4444",
    accent: "#38bdf8",
    healthDeep: "#7f1d1f",
    manaDeep: "#1d4ed8",
    staminaDeep: "#3f6212",
    shieldDeep: "#0e7490",
    xpDeep: "#6b21a8",
    accentDeep: "#0b5f88",
    accentGlow: "rgba(56, 189, 248, 0.5)",
    accentDim: "rgba(56, 189, 248, 0.18)",
  },
  surface: {
    surface: "#141820",
    surfaceDeep: "#0a0c10",
    edge: "#2c3340",
    edgeBright: "#4a5566",
    text: "#f5f7fa",
    textDim: "#94a3b8",
    backdrop: "rgba(4,7,12,0.62)",
  },
  status: {
    danger: "#e5484d",
    warning: "#f8b84e",
    success: "#3fa34d",
    hostile: "#e5484d",
    friendly: "#38bdf8",
    neutral: "#c9b458",
  },
  font: {
    display: '"Segoe UI", system-ui, sans-serif',
    numeric: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
    body: '"Segoe UI", system-ui, sans-serif',
  },
  rarity: {
    common: "#b4b2a8",
    uncommon: "#57c14f",
    rare: "#4a86d8",
    epic: "#a04fd0",
    legendary: "#e0862e",
  },
  frame: {
    bg: "linear-gradient(180deg, rgba(20,24,32,0.86), rgba(10,12,16,0.9))",
    border: "1px solid rgba(255,255,255,0.12)",
    radius: "10px",
    glow: "0 6px 20px rgba(0,0,0,0.45)",
  },
  bar: {
    track: "rgba(0,0,0,0.55)",
    frame: "rgba(0,0,0,0.82)",
    height: "18px",
    radius: "4px",
    bevel: "inset 0 2px 4px rgba(0,0,0,0.55), inset 0 -1px 2px rgba(255,255,255,0.08)",
    text: "#f5f7fa",
  },
  slot: { bg: "rgba(12,14,20,0.7)", border: "1px solid rgba(255,255,255,0.12)", radius: "8px" },
  ring: "rgba(140,170,200,0.35)",
};

/** Per-group partial overrides accepted by {@link hudTheme}. */
export interface HudThemeOverrides {
  palette?: Partial<HudThemePalette>;
  surface?: Partial<HudThemeSurface>;
  status?: Partial<HudThemeStatus>;
  font?: Partial<HudThemeFont>;
  rarity?: Partial<HudThemeRarity>;
  frame?: Partial<HudThemeFrame>;
  bar?: Partial<HudThemeBar>;
  slot?: Partial<HudThemeSlot>;
  ring?: string;
  skin?: HudSkin;
}

/**
 * Builds a full {@link HudTheme} from per-group partials, filling the rest from
 * {@link defaultHudTheme}. Reach for this when a game wants to name exact values; use
 * {@link deriveHudTheme} when a seed color pair is enough.
 *
 * @capability hud-theme-author fill a full HudTheme from per-group partial overrides
 */
export function hudTheme(overrides: HudThemeOverrides): HudTheme {
  return {
    palette: { ...defaultHudTheme.palette, ...overrides.palette },
    surface: { ...defaultHudTheme.surface, ...overrides.surface },
    status: { ...defaultHudTheme.status, ...overrides.status },
    font: { ...defaultHudTheme.font, ...overrides.font },
    rarity: { ...defaultHudTheme.rarity, ...overrides.rarity },
    frame: { ...defaultHudTheme.frame, ...overrides.frame },
    bar: { ...defaultHudTheme.bar, ...overrides.bar },
    slot: { ...defaultHudTheme.slot, ...overrides.slot },
    ring: overrides.ring ?? defaultHudTheme.ring,
    skin: overrides.skin,
  };
}

const theme = hudTheme;

interface ChromeSpec {
  accent: string;
  accentGlow: string;
  accentDeep: string;
  surface: string;
  surfaceDeep: string;
  edge: string;
  edgeBright: string;
  text: string;
  textDim: string;
  fills: { health: string; mana: string; stamina: string; xp: string; shield: string };
  deeps: { health: string; mana: string; stamina: string; xp: string; shield: string };
  status: HudThemeStatus;
  display: string;
  rarity: HudThemeRarity;
}

/** Builds a chrome-led preset: the named surface/edge values drive frames, troughs, and slots. */
function chrome(spec: ChromeSpec): HudTheme {
  return theme({
    palette: {
      health: spec.fills.health,
      healthLow: spec.deeps.health,
      healthDeep: spec.deeps.health,
      mana: spec.fills.mana,
      manaDeep: spec.deeps.mana,
      stamina: spec.fills.stamina,
      staminaDeep: spec.deeps.stamina,
      shield: spec.fills.shield,
      shieldDeep: spec.deeps.shield,
      xp: spec.fills.xp,
      xpDeep: spec.deeps.xp,
      soul: mix(spec.fills.xp, "#ffffff", 0.25),
      ammo: spec.status.warning,
      boss: spec.status.danger,
      accent: spec.accent,
      accentDeep: spec.accentDeep,
      accentGlow: spec.accentGlow,
      accentDim: alpha(spec.accent, 0.18),
    },
    surface: {
      surface: spec.surface,
      surfaceDeep: spec.surfaceDeep,
      edge: spec.edge,
      edgeBright: spec.edgeBright,
      text: spec.text,
      textDim: spec.textDim,
      backdrop: alpha(spec.surfaceDeep, 0.72),
    },
    status: spec.status,
    font: { display: spec.display },
    rarity: spec.rarity,
    frame: {
      bg: `linear-gradient(180deg, ${alpha(spec.surface, 0.92)}, ${alpha(spec.surfaceDeep, 0.94)})`,
      border: `1px solid ${spec.edge}`,
      radius: "6px",
      glow: `0 6px 20px ${alpha(spec.surfaceDeep, 0.7)}`,
    },
    bar: { track: alpha(spec.surfaceDeep, 0.8), frame: spec.surfaceDeep, text: spec.text },
    slot: { bg: alpha(spec.surface, 0.8), border: `1px solid ${spec.edge}`, radius: "6px" },
    ring: alpha(spec.edgeBright, 0.55),
  });
}

/** Built-in theme presets for demos/scaffold only — not product identity; games author their own theme. */
export const HUD_THEME_PRESETS = {
  "arcane-stone": theme({
    palette: { health: "#c0392b", mana: "#7c5cff", xp: "#d4a017", accent: "#b483ff", shield: "#8e7bd6" },
    frame: {
      bg: "linear-gradient(180deg, #3a3550, #211d33)",
      border: "2px solid #6b5b95",
      radius: "6px",
      glow: "0 0 18px rgba(124,92,255,0.35)",
    },
    bar: { frame: "#160f28", radius: "3px", height: "20px", track: "rgba(0,0,0,0.6)", bevel: "inset 0 2px 5px rgba(0,0,0,0.6)", text: "#efe7ff" },
    slot: { bg: "#241f38", border: "2px solid #6b5b95", radius: "5px" },
    ring: "rgba(124,92,255,0.5)",
  }),
  "survival-wood": theme({
    palette: { health: "#c0553b", stamina: "#a3b545", xp: "#e0a94b", accent: "#d9a441", shield: "#7bb0a0" },
    frame: {
      bg: "linear-gradient(180deg, #4a3b28, #2e2117)",
      border: "3px solid #6b4a2c",
      radius: "4px",
      glow: "0 4px 10px rgba(0,0,0,0.5)",
    },
    bar: { frame: "#2a1c10", radius: "2px", height: "18px", track: "rgba(30,20,10,0.7)", bevel: "inset 0 2px 4px rgba(0,0,0,0.6)", text: "#f3e6cf" },
    slot: { bg: "#3a2a1a", border: "3px solid #6b4a2c", radius: "3px" },
    ring: "rgba(107,74,44,0.6)",
  }),
  "military-flat": theme({
    palette: { health: "#3fa34d", stamina: "#a8b545", xp: "#c9b458", accent: "#7d9b4e", shield: "#5f8fae" },
    frame: {
      bg: "linear-gradient(180deg, #2b3126, #1c2019)",
      border: "1px solid #4a5340",
      radius: "2px",
      glow: "0 2px 6px rgba(0,0,0,0.5)",
    },
    bar: { frame: "#161a12", radius: "0px", height: "16px", track: "rgba(0,0,0,0.6)", bevel: "inset 0 1px 2px rgba(0,0,0,0.7)", text: "#e8efdc" },
    slot: { bg: "#232a1e", border: "1px solid #4a5340", radius: "0px" },
    ring: "rgba(125,155,78,0.5)",
  }),
  "sleek-hex": theme({
    palette: { health: "#ff5a7a", mana: "#33c9ff", xp: "#38e8c0", accent: "#33c9ff", shield: "#33c9ff" },
    frame: {
      bg: "linear-gradient(180deg, rgba(18,24,34,0.9), rgba(8,12,18,0.94))",
      border: "1px solid rgba(51,201,255,0.4)",
      radius: "3px",
      glow: "0 0 16px rgba(51,201,255,0.3)",
    },
    bar: { frame: "rgba(51,201,255,0.5)", radius: "2px", height: "14px", track: "rgba(0,0,0,0.5)", bevel: "inset 0 1px 3px rgba(0,0,0,0.5)", text: "#eafaff" },
    slot: { bg: "rgba(12,18,26,0.8)", border: "1px solid rgba(51,201,255,0.4)", radius: "3px" },
    ring: "rgba(51,201,255,0.55)",
  }),
  "elemental-circle": theme({
    palette: { health: "#ff6b3d", mana: "#4aa8ff", stamina: "#7bd451", xp: "#ffcf40", accent: "#ffcf40", shield: "#4aa8ff" },
    frame: {
      bg: "radial-gradient(circle at 50% 40%, #2c2a3a, #16141f)",
      border: "2px solid #d9a441",
      radius: "9999px",
      glow: "0 0 20px rgba(217,164,65,0.35)",
    },
    bar: { frame: "#1a1626", radius: "9999px", height: "16px", track: "rgba(0,0,0,0.55)", bevel: "inset 0 2px 4px rgba(0,0,0,0.6)", text: "#fff3d6" },
    slot: { bg: "#221f30", border: "2px solid #d9a441", radius: "9999px" },
    ring: "rgba(217,164,65,0.6)",
  }),
  "sandbox-slot": theme({
    palette: { health: "#e0524a", stamina: "#77c043", xp: "#5ac0e0", accent: "#f0c040", shield: "#5ac0e0" },
    frame: {
      bg: "linear-gradient(180deg, #5a5a5a, #3a3a3a)",
      border: "3px solid #2a2a2a",
      radius: "2px",
      glow: "3px 3px 0 rgba(0,0,0,0.5)",
    },
    bar: { frame: "#1e1e1e", radius: "0px", height: "18px", track: "rgba(0,0,0,0.6)", bevel: "inset 0 2px 3px rgba(0,0,0,0.6)", text: "#f4f4f4" },
    slot: { bg: "#4a4a4a", border: "3px solid #2a2a2a", radius: "0px" },
    ring: "rgba(240,192,64,0.5)",
  }),
  ember: chrome({
    accent: "#e3b054",
    accentGlow: "rgba(227, 176, 84, 0.55)",
    accentDeep: "#8a6425",
    surface: "#17120d",
    surfaceDeep: "#0b0906",
    edge: "#57452c",
    edgeBright: "#93794c",
    text: "#f2e7d0",
    textDim: "#a3947a",
    fills: { health: "#5cc35f", mana: "#4a86d8", stamina: "#d9c33f", xp: "#a566d9", shield: "#9fb9c9" },
    deeps: { health: "#26662c", mana: "#20406f", stamina: "#6e621c", xp: "#4e2c6e", shield: "#48606e" },
    status: {
      danger: "#e0483e",
      warning: "#e8a33d",
      success: "#6fce6f",
      hostile: "#d84a3a",
      friendly: "#4fa9e0",
      neutral: "#d9d04f",
    },
    display: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    rarity: {
      common: "#b4b2a8",
      uncommon: "#57c14f",
      rare: "#4a86d8",
      epic: "#a04fd0",
      legendary: "#e0862e",
    },
  }),
  synthwave: chrome({
    accent: "#41e6f0",
    accentGlow: "rgba(65, 230, 240, 0.55)",
    accentDeep: "#136b74",
    surface: "#12101f",
    surfaceDeep: "#080711",
    edge: "#3c3467",
    edgeBright: "#6a5daa",
    text: "#e9ecff",
    textDim: "#8d8bb3",
    fills: { health: "#3ee08a", mana: "#5a7bff", stamina: "#f0e341", xp: "#e050d8", shield: "#8ad4f0" },
    deeps: { health: "#136b44", mana: "#243487", stamina: "#77701a", xp: "#6e2069", shield: "#2f6d85" },
    status: {
      danger: "#ff4d6a",
      warning: "#ffb347",
      success: "#3ee08a",
      hostile: "#ff4d6a",
      friendly: "#41e6f0",
      neutral: "#f0e341",
    },
    display: '"Segoe UI", system-ui, sans-serif',
    rarity: {
      common: "#9fa4bd",
      uncommon: "#3ee08a",
      rare: "#5a7bff",
      epic: "#e050d8",
      legendary: "#ffb347",
    },
  }),
  fieldkit: chrome({
    accent: "#d8c169",
    accentGlow: "rgba(216, 193, 105, 0.45)",
    accentDeep: "#6e6230",
    surface: "#14160f",
    surfaceDeep: "#0a0b07",
    edge: "#454a35",
    edgeBright: "#6f7657",
    text: "#e6e8d8",
    textDim: "#95997f",
    fills: { health: "#7fb84a", mana: "#57a8b8", stamina: "#c9b73e", xp: "#b88f4a", shield: "#a8b4a0" },
    deeps: { health: "#3d5c1f", mana: "#265059", stamina: "#645a1c", xp: "#5c451f", shield: "#4e594a" },
    status: {
      danger: "#d84f35",
      warning: "#d8952f",
      success: "#7fb84a",
      hostile: "#d84f35",
      friendly: "#57a8b8",
      neutral: "#c9b73e",
    },
    display: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif',
    rarity: {
      common: "#a8ab99",
      uncommon: "#7fb84a",
      rare: "#57a8b8",
      epic: "#b06fc9",
      legendary: "#d8952f",
    },
  }),
} satisfies Record<string, HudTheme>;

/** Built-in demo/scaffold theme preset name — not a game identity. */
export type HudThemePreset = keyof typeof HUD_THEME_PRESETS;

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

/** Seed colors for {@link deriveHudTheme}. Only `accent` and `surface` are required. */
export interface HudThemeSeed {
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

/**
 * Derives a coherent full theme from an accent/surface pair — shades, edges, dim text, frames,
 * bar troughs, and slots all fall out of the seed, so a game gets one consistent look across the
 * `packages/react` primitives and the `registry/jgengine` blocks without naming 50 tokens.
 * Hex seeds only (`#rgb` or `#rrggbb`).
 *
 * @capability hud-theme-derive build a full HudTheme from an accent + surface seed pair
 */
export function deriveHudTheme(seed: HudThemeSeed): HudTheme {
  const { accent, surface } = seed;
  const text = seed.text ?? mix("#f4f4f0", accent, 0.12);
  const health = seed.health ?? "#e0483e";
  const mana = seed.mana ?? "#4a86d8";
  const stamina = seed.stamina ?? "#d9c33f";
  const xp = seed.xp ?? "#a566d9";
  const shield = seed.shield ?? "#9fb9c9";
  const danger = seed.danger ?? "#e0483e";
  const surfaceDeep = mix(surface, "#000000", 0.5);
  const edge = mix(surface, accent, 0.22);
  const edgeBright = mix(surface, accent, 0.42);
  return hudTheme({
    palette: {
      health,
      healthLow: mix(health, "#000000", 0.3),
      healthDeep: mix(health, "#000000", 0.5),
      mana,
      manaDeep: mix(mana, "#000000", 0.5),
      stamina,
      staminaDeep: mix(stamina, "#000000", 0.5),
      shield,
      shieldDeep: mix(shield, "#000000", 0.5),
      xp,
      xpDeep: mix(xp, "#000000", 0.5),
      soul: mix(xp, "#ffffff", 0.25),
      ammo: seed.warning ?? "#e8a33d",
      boss: danger,
      accent,
      accentDeep: mix(accent, "#000000", 0.55),
      accentGlow: alpha(accent, 0.5),
      accentDim: alpha(accent, 0.18),
    },
    surface: { surface, surfaceDeep, edge, edgeBright, text, textDim: mix(text, surface, 0.42), backdrop: alpha(surfaceDeep, 0.72) },
    status: {
      danger,
      warning: seed.warning ?? "#e8a33d",
      success: accent,
      hostile: danger,
      friendly: seed.friendly ?? mana,
      neutral: stamina,
    },
    font: { display: seed.fontDisplay ?? defaultHudTheme.font.display },
    frame: {
      bg: `linear-gradient(180deg, ${alpha(surface, 0.92)}, ${alpha(surfaceDeep, 0.94)})`,
      border: `1px solid ${edge}`,
      glow: `0 6px 20px ${alpha(surfaceDeep, 0.7)}`,
    },
    bar: { track: alpha(surfaceDeep, 0.8), frame: surfaceDeep, text },
    slot: { bg: alpha(surface, 0.8), border: `1px solid ${edge}`, radius: "6px" },
    ring: alpha(edgeBright, 0.55),
  });
}

/** Resolves a preset name (or a full theme) to a `HudTheme`; falls back to the default theme. */
export function resolveHudTheme(theme?: HudThemePreset | HudTheme): HudTheme {
  if (theme === undefined) return defaultHudTheme;
  if (typeof theme === "string") return HUD_THEME_PRESETS[theme] ?? defaultHudTheme;
  return theme;
}
