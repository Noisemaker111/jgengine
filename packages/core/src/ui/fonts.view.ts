import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useEffect } from "react";


/** One font file a game ships (an OFL or other licensed TTF/WOFF2 bundled with the game). */
export interface GameFontFace {
  /** Family name the game's CSS uses, e.g. `"Bangers"`. */
  family: string;
  /** URL of the file, usually a Vite asset import (`import bangers from "./fonts/Bangers-Regular.ttf"`). */
  src: string;
  /** Weight or variable range, e.g. `400` or `"200 900"`. Default `"100 900"` so one file covers every weight asked for. */
  weight?: number | string;
  style?: "normal" | "italic";
}

/** The pair of fonts that gives a game its voice: a display face for titles and numbers, a body face for reading. */
export interface GameFontPairing {
  display: GameFontFace;
  body: GameFontFace;
  /** Optional face for timers, money and counters; defaults to the display face. */
  numeric?: GameFontFace;
}

const FALLBACK = {
  display: '"Bahnschrift", "Arial Narrow", Impact, sans-serif',
  body: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
} as const;

const quote = (family: string): string => `"${family.replace(/"/g, "")}"`;

/**
 * The CSS font stacks for a pairing, with installed fallbacks, ready for a `hudTheme` or a kit:
 * `{ fontDisplay, fontBody, fontNumeric }`.
 *
 * @capability game-font-stacks display/body/numeric font stacks for a game's font pairing, with installed fallbacks
 */
export function gameFontStacks(pairing: GameFontPairing): { fontDisplay: string; fontBody: string; fontNumeric: string } {
  const display = `${quote(pairing.display.family)}, ${FALLBACK.display}`;
  return {
    fontDisplay: display,
    fontBody: `${quote(pairing.body.family)}, ${FALLBACK.body}`,
    fontNumeric: pairing.numeric === undefined ? display : `${quote(pairing.numeric.family)}, ${FALLBACK.display}`,
  };
}

const loaded = new Set<string>();

/** Registers `faces` with the document's font set once each and starts loading them. Safe on the server. */
export function loadGameFonts(faces: readonly GameFontFace[]): void {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || document.fonts === undefined) return;
  for (const face of faces) {
    const key = `${face.family}|${face.src}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    const font = new FontFace(face.family, `url(${JSON.stringify(resolveAssetBaseUrl(face.src))})`, {
      weight: String(face.weight ?? "100 900"),
      style: face.style ?? "normal",
      display: "swap",
    });
    document.fonts.add(font);
    void font.load().catch(() => loaded.delete(key));
  }
}

/**
 * Loads a game's bundled fonts (its display and body faces) so titles, HUD numbers and menus use
 * them instead of the browser's default sans. Pair it with {@link gameFontStacks} for the CSS.
 *
 * ```tsx
 * import bangers from "../art/fonts/Bangers-Regular.ttf";
 * import barlow from "../art/fonts/Barlow-Medium.ttf";
 * const FONTS = { display: { family: "Bangers", src: bangers }, body: { family: "Barlow", src: barlow } };
 * useGameFonts(FONTS); // and hudTheme fonts from gameFontStacks(FONTS)
 * ```
 *
 * @capability game-fonts load a game's bundled display and body fonts
 */
export function useGameFonts(fonts: GameFontPairing | readonly GameFontFace[]): void {
  const faces: readonly GameFontFace[] = Array.isArray(fonts)
    ? (fonts as readonly GameFontFace[])
    : [(fonts as GameFontPairing).display, (fonts as GameFontPairing).body, ...((fonts as GameFontPairing).numeric === undefined ? [] : [(fonts as GameFontPairing).numeric!])];
  const key = faces.map((face) => `${face.family}|${face.src}`).join(",");
  useEffect(() => {
    loadGameFonts(faces);
    // `key` covers the faces; the array identity may change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
