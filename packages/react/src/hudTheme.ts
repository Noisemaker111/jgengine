import { type CSSProperties } from "react";

/**
 * `HudTheme` (#1034): one token object that restyles the shared HUD chrome at once. It is the
 * superset of the atomic-bar tokens (#1033) — `hudThemeVars(theme)` emits the same `--jg-*` custom
 * properties the bars already read, plus frame / slot / minimap-ring tokens — so setting it on any
 * HUD ancestor re-skins every token-driven primitive under it. Purely CSS-token driven (no image
 * assets); layout and per-widget `style` overrides still win, and games can ignore presets entirely.
 *
 * @capability hud-theme one token object + genre presets driving bars, frames, slots, and minimap ring
 */

/** Per-readout fill colors plus a shared accent/glow. */
export interface HudThemePalette {
  health: string;
  healthLow: string;
  mana: string;
  stamina: string;
  shield: string;
  xp: string;
  soul: string;
  ammo: string;
  boss: string;
  /** Accent used for glow/keycap/active states. */
  accent: string;
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

/** A full HUD theme. */
export interface HudTheme {
  palette: HudThemePalette;
  frame: HudThemeFrame;
  bar: HudThemeBar;
  slot: HudThemeSlot;
  /** Minimap chrome ring color. */
  ring: string;
}

/** Emits the CSS custom properties for a theme — spread onto any HUD ancestor to re-skin the subtree. */
export function hudThemeVars(theme: HudTheme): CSSProperties {
  const { palette, frame, bar, slot } = theme;
  return {
    // atomic-bar tokens (same names the bars read — #1033)
    "--jg-health": palette.health,
    "--jg-health-low": palette.healthLow,
    "--jg-mana": palette.mana,
    "--jg-stamina": palette.stamina,
    "--jg-shield": palette.shield,
    "--jg-xp": palette.xp,
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

/** The upgraded default theme — a bare game reads as designed chrome, not a generic dark-glass dashboard. */
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

function theme(overrides: {
  palette?: Partial<HudThemePalette>;
  frame?: Partial<HudThemeFrame>;
  bar?: Partial<HudThemeBar>;
  slot?: Partial<HudThemeSlot>;
  ring?: string;
}): HudTheme {
  return {
    palette: { ...defaultHudTheme.palette, ...overrides.palette },
    frame: { ...defaultHudTheme.frame, ...overrides.frame },
    bar: { ...defaultHudTheme.bar, ...overrides.bar },
    slot: { ...defaultHudTheme.slot, ...overrides.slot },
    ring: overrides.ring ?? defaultHudTheme.ring,
  };
}

/** Built-in genre presets — a one-prop identity choice; the ten-classic-styles surface. */
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
} satisfies Record<string, HudTheme>;

/** A genre-preset name. */
export type HudThemePreset = keyof typeof HUD_THEME_PRESETS;

/** Resolves a preset name (or a full theme) to a `HudTheme`; falls back to the default theme. */
export function resolveHudTheme(theme?: HudThemePreset | HudTheme): HudTheme {
  if (theme === undefined) return defaultHudTheme;
  if (typeof theme === "string") return HUD_THEME_PRESETS[theme] ?? defaultHudTheme;
  return theme;
}
