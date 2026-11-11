import type { RuneTheme } from "@jgengine/core/ui/rune/primitives";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";

import { GAME_FONTS } from "../art/fonts/fonts";

/** LLMville's warm-on-ink palette (docs/design/DESIGN.md §2): the one place its colours are written. */
export const LLMVILLE_PALETTE = {
  cream: "#f4ecdd",
  creamDim: "#c7bca9",
  coral: "#e8836b",
  coralDeep: "#c75d45",
  teal: "#5fc2a8",
  tealDeep: "#3c8c76",
  amber: "#e0a95c",
  wood: "#b07a4e",
  ink: "#16201e",
  ink2: "#1f2b28",
  destructive: "#d9544a",
} as const;

const P = LLMVILLE_PALETTE;

/** Colours the native UI uses beyond the palette: translucent washes, paper and error text. */
export const C = {
  ...P,
  faint: "#f4ecdd73",
  muted: "#f4ecddb3",
  line: "#f4ecdd1f",
  error: "#f0a097",
  paper: "#f6e7b8",
  paperInk: "#2d2416",
  paperMuted: "#4a3f32",
  scrim: "#000000a6",
  glass: "#16201ef2",
} as const;

export const FULL = { fraction: 1 } as const;
export const DISPLAY = "Baloo 2";
export const BODY = "Nunito";

/** Baloo 2 for titles and numbers, Nunito for reading text; both bundled under OFL. */
export const llmvilleTheme = {
  colors: { accent: P.coral, teal: P.teal, amber: P.amber, ink: P.cream, muted: C.muted, danger: P.destructive, track: C.line, ground: P.ink },
  text: {
    body: { family: BODY, size: 15 },
    label: { family: BODY, size: 11, weight: 700, tracking: 1.2, color: C.faint },
    heading: { family: DISPLAY, size: 24, weight: 800 },
    title: { family: DISPLAY, size: 64, weight: 800 },
    mono: { family: BODY, size: 14, weight: 800, mono: true },
  },
  variants: {
    panel: { padding: 20, gap: 12, fill: "#1f2b28f0", border: { width: 1, color: "#f4ecdd26" }, radius: 18, shadow: { y: 18, blur: 48, color: "#00000080" } },
    terminal: { padding: 22, gap: 12, fill: "#111a18f5", border: { width: 1, color: "#5fc2a840" }, radius: 14, shadow: { y: 18, blur: 48, color: "#00000099" } },
    inset: { padding: 14, gap: 8, fill: "#00000033", border: { width: 1, color: "#f4ecdd1f" }, radius: 12 },
    sticky: { padding: 16, gap: 10, fill: C.paper, radius: 6, shadow: { x: 2, y: 6, blur: 14, color: "#00000066" } },
    toast: { padding: 14, gap: 6, fill: "#1f2b28f5", border: { width: 1, color: "#5fc2a84d" }, radius: 14, shadow: { y: 10, blur: 28, color: "#00000080" } },
    primary: { minHeight: 46, padding: [10, 18, 10, 18], gap: 8, items: "center", justify: "center", fill: P.coral, border: { width: 2, color: P.coralDeep }, radius: 14, hover: "#ffffff26", press: "#00000026" },
    secondary: { minHeight: 46, padding: [10, 18, 10, 18], gap: 8, items: "center", justify: "center", fill: P.ink2, border: { width: 1, color: "#f4ecdd33" }, radius: 14, hover: "#ffffff14", press: "#00000033" },
    ghost: { minHeight: 40, padding: [8, 14, 8, 14], gap: 6, items: "center", justify: "center", border: { width: 1, color: "#f4ecdd26" }, radius: 12, hover: "#ffffff14", press: "#00000033" },
    danger: { minHeight: 46, padding: [10, 18, 10, 18], gap: 8, items: "center", justify: "center", fill: "#e8836b1a", border: { width: 1, color: "#e8836b66" }, radius: 14, hover: "#e8836b26", press: "#00000033" },
    link: { padding: [4, 2, 4, 2], gap: 6, items: "center", hover: "#ffffff0f", radius: 6 },
    chip: { padding: [6, 12, 6, 12], gap: 6, items: "center", fill: "#ffffff0d", radius: 999, hover: "#ffffff1a", press: "#00000033" },
    field: { minHeight: 44, padding: [10, 12, 10, 12], fill: "#0e1614", border: { width: 1, color: "#f4ecdd33" }, radius: 12 },
  },
  motion: { duration: 180, distance: 12, bounce: 0 },
} satisfies RuneTheme;

let fontsRegistered = false;
/** Hand the bundled font files to the native surface before it first mounts. */
export function registerLlmvilleFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  for (const face of GAME_FONTS) if (face.style !== "italic") registerNativeRuneFont(resolveAssetBaseUrl(face.src));
}
