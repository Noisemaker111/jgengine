import { gameFontStacks } from "@jgengine/core/ui/fonts.view";
import { hudTheme } from "@jgengine/core/hud/hudTheme.view";
import { customizeKit } from "@jgengine/core/ui/kit/uiKit.view";
import { UI_KITS } from "@jgengine/core/ui/kit/uiKits.view";
import { GAME_FONTS } from "../../art/fonts/fonts";

/** Bangers on every sign and number, Barlow for reading: the boulevard's two faces. */
const FONTS = gameFontStacks(GAME_FONTS);

/**
 * Mainsail at sundown: harbor-night teal, cream card stock, amber backlight, coral neon. The one
 * palette: the kit carries every colour as a `--kit-*` token for the CSS, and code that tints a kit
 * part reads the same values here.
 */
export const HH = {
  night: "#071d25",
  ink: "#0e2c38",
  teal: "#155462",
  mint: "#76d4c3",
  cream: "#fff0d2",
  amber: "#ffb020",
  coral: "#ef5a3c",
  lcdInk: "#2a1704",
  sign: "#0f6a43",
  hhpd: "#4f7de8",
  siren: "#e8343b",
  cash: "#8fe39a",
} as const;

/**
 * Inkline drawn as a Mainsail dispatch poster: the ink is deep harbor teal instead of black, every
 * caption tab is a sunset band (amber into orange into coral), halftone dots are warm, and type is the
 * condensed street-sign face of the boulevard.
 */
export const harborKit = customizeKit(UI_KITS.ink, {
  name: "Harbor Heat",
  tokens: {
    ink: HH.ink,
    line: HH.ink,
    surface: HH.cream,
    surfaceAlt: "#f4d9a6",
    accent: HH.amber,
    accentInk: HH.ink,
    good: "#2fb39a",
    warn: "#ff8a3d",
    bad: HH.coral,
    scrim: "rgba(8, 35, 45, 0.62)",
    halftone: "rgba(239, 90, 60, 0.2)",
    fontDisplay: FONTS.fontDisplay,
    fontBody: FONTS.fontBody,
    night: HH.night,
    teal: HH.teal,
    mint: HH.mint,
    lcdInk: HH.lcdInk,
    sign: HH.sign,
    hhpd: HH.hhpd,
    siren: HH.siren,
    cash: HH.cash,
  },
  css: `
[data-jg-kit] .jgk-ink-title { background: linear-gradient(100deg, var(--kit-accent) 64%, var(--kit-warn) 64% 80%, var(--kit-bad) 80%); }
[data-jg-kit] .jgk-ink-panel[data-variant="hud"] { margin-top: 20px; max-width: min(380px, 88vw); }
[data-jg-kit] .jgk-ink-panel[data-variant="hud"] .jgk-ink-panel-body { font-size: calc(13px * var(--kit-text)); }
@media (max-width: 600px) {
  [data-jg-kit] .jgk-ink-menu[data-variant] .jgk-ink-menu-item { min-width: 0; padding: 6px 14px 4px; font-size: 19px; }
}
`,
});

/** The same palette for the shell parts a kit does not draw (settings, touch dock, menu header). */
export const harborTheme = hudTheme({
  palette: { accent: HH.amber, accentDeep: "#ad7140", accentGlow: "#ffb02066", accentDim: "#ffb02022", health: "#3fbf5a", shield: "#4fa5e8", xp: "#e8a5ff" },
  surface: { surface: "#102e3be8", surfaceDeep: "#08232d", edge: "#76d4c355", edgeBright: "#76d4c3", text: HH.cream, textDim: "#b9cbd0", backdrop: "#08232dc9" },
  status: { danger: HH.coral, warning: HH.amber, success: "#3fbf5a", hostile: "#c23b3b", friendly: "#76d4c3", neutral: "#ffc879" },
  font: { display: FONTS.fontDisplay, body: FONTS.fontBody, numeric: FONTS.fontNumeric },
  frame: { bg: "#102e3b", border: "1px solid #76d4c377", radius: "8px", glow: "0 20px 80px #0008" },
  slot: { bg: "#194451", border: "1px solid #76d4c355", radius: "5px" },
});
