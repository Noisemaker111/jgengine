import { libraryFontPairing } from "@jgengine/assets/catalogs/fontLibrary";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";

/** Bangers on every sign and number, Barlow for reading: the boulevard's two faces, both from the shared font library. */
export const HARBOR_FONTS = libraryFontPairing("bangers", "barlow");

let registered = false;
/** Hand both faces to the native surface before it mounts. */
export function registerHarborFonts(): void {
  if (registered) return;
  registered = true;
  registerNativeRuneFont(resolveAssetBaseUrl(HARBOR_FONTS.display.src));
  registerNativeRuneFont(resolveAssetBaseUrl(HARBOR_FONTS.body.src));
}

/** Mainsail at sundown: harbor-night teal, cream card stock, amber backlight, coral neon. The one palette. */
export const HH = {
  night: "#071d25",
  ink: "#0e2c38",
  teal: "#155462",
  mint: "#76d4c3",
  cream: "#fff0d2",
  paper: "#f7ead0",
  amber: "#ffb020",
  coral: "#ef5a3c",
  lcd: "#f0b44a",
  lcdAlarm: "#ff8a6a",
  lcdInk: "#2a1704",
  sign: "#0f6a43",
  hhpd: "#4f7de8",
  siren: "#e8343b",
  cash: "#8fe39a",
  dim: "#b9cbd0",
  good: "#2fb39a",
  scrim: "#08232dd0",
} as const;

export const DISPLAY = HARBOR_FONTS.display.family;
export const BODY = HARBOR_FONTS.body.family;

const shadow = (x: number, y: number) => ({ x, y, blur: 0, color: "#071d25cc" });

/** Harbor Heat's one Rune theme: palette, three text faces and the street-hardware surfaces. */
export const harborTheme = {
  colors: { ...HH },
  text: {
    body: { family: BODY, size: 16, color: HH.cream },
    label: { family: BODY, size: 12, weight: 600, tracking: 1.4, color: HH.dim },
    display: { family: DISPLAY, size: 44, color: HH.amber, tracking: 1 },
    heading: { family: DISPLAY, size: 26, color: HH.cream, tracking: 0.6 },
    lcd: { mono: true, size: 14, weight: 600, color: HH.lcdInk },
  },
  variants: {
    surface: { padding: 16, gap: 10, fill: "#102e3bf0", border: { width: 2, color: "#76d4c366" }, radius: 6, shadow: { y: 14, blur: 40, color: "#00000080" } },
    paper: { padding: 16, gap: 8, fill: HH.paper, border: { width: 2, color: "#3a2a18" }, radius: 3, shadow: shadow(6, 6) },
    lcd: { padding: [8, 10, 8, 10], gap: 4, fill: HH.lcd, border: { width: 2, color: "#5a3a10" }, radius: 4, shadow: { y: 0, blur: 8, color: "#00000066", inset: true } },
    action: { minHeight: 40, padding: [9, 16, 8, 16], gap: 8, fill: HH.amber, border: { width: 2, color: HH.night }, radius: 3, hover: "#ffffff38", press: "#00000030", shadow: shadow(3, 3), items: "center", justify: "center" },
    quiet: { minHeight: 40, padding: [9, 16, 8, 16], gap: 8, fill: HH.ink, border: { width: 2, color: "#76d4c388" }, radius: 3, hover: "#ffffff22", press: "#00000030", shadow: shadow(3, 3), items: "center", justify: "center" },
    danger: { minHeight: 40, padding: [9, 16, 8, 16], gap: 8, fill: HH.coral, border: { width: 2, color: HH.night }, radius: 3, hover: "#ffffff30", press: "#00000030", shadow: shadow(3, 3), items: "center", justify: "center" },
    line: { minHeight: 34, padding: [6, 10, 6, 10], gap: 8, radius: 3, hover: "#2a170422", press: "#2a170440", items: "center" },
    key: { minWidth: 22, height: 22, padding: [0, 6, 0, 6], fill: HH.cream, border: { width: 1, color: HH.night }, radius: 4, shadow: { x: 0, y: 2, blur: 0, color: HH.night }, items: "center", justify: "center" },
  },
  motion: { duration: 160, distance: 10, bounce: 0 },
} satisfies RuneTheme;
