import type { GameFontFace, GameFontPairing } from "@jgengine/core/ui/fonts.view";

/** What a family is for: titles and numbers, reading text, or either. */
export type FontRole = "display" | "body" | "both";

/** One curated OFL family, shipped as its Latin 400 woff2 file. */
export interface FontEntry {
  /** The id a game names, e.g. `"oswald"`. */
  id: string;
  /** CSS family name. */
  family: string;
  role: FontRole;
  /** Moods the family suits: fantasy, sci-fi, industrial, cozy, sports, military, neutral. */
  moods: readonly string[];
  author: string;
  /** Fontsource package the file comes from (`@fontsource/<package>`). */
  package: string;
}

/** The shipped font families, each a display or a body face. */
export const FONT_LIBRARY = [
  { id: "cinzel", family: "Cinzel", role: "display", moods: ["fantasy"], author: "Natanael Gama", package: "cinzel" },
  { id: "crimson-pro", family: "Crimson Pro", role: "body", moods: ["fantasy", "cozy"], author: "Jacques Le Bailly", package: "crimson-pro" },
  { id: "orbitron", family: "Orbitron", role: "display", moods: ["sci-fi"], author: "Matt McInerney", package: "orbitron" },
  { id: "rajdhani", family: "Rajdhani", role: "body", moods: ["sci-fi", "sports"], author: "Indian Type Foundry", package: "rajdhani" },
  { id: "oswald", family: "Oswald", role: "display", moods: ["industrial", "sports"], author: "Vernon Adams", package: "oswald" },
  { id: "barlow", family: "Barlow", role: "body", moods: ["industrial", "military"], author: "Jeremy Tribby", package: "barlow" },
  { id: "fredoka", family: "Fredoka", role: "display", moods: ["cozy"], author: "Milena Brandão", package: "fredoka" },
  { id: "nunito", family: "Nunito", role: "body", moods: ["cozy"], author: "Vernon Adams, Jacques Le Bailly", package: "nunito" },
  { id: "bebas-neue", family: "Bebas Neue", role: "display", moods: ["sports"], author: "Ryoichi Tsunekawa", package: "bebas-neue" },
  { id: "roboto", family: "Roboto", role: "body", moods: ["sports", "neutral"], author: "Christian Robertson", package: "roboto" },
  { id: "stardos-stencil", family: "Stardos Stencil", role: "display", moods: ["military"], author: "Vernon Adams", package: "stardos-stencil" },
  { id: "share-tech-mono", family: "Share Tech Mono", role: "both", moods: ["military", "sci-fi"], author: "Carrois Apostrophe", package: "share-tech-mono" },
  { id: "bangers", family: "Bangers", role: "display", moods: ["sports", "comic"], author: "Vernon Adams", package: "bangers" },
  { id: "russo-one", family: "Russo One", role: "display", moods: ["industrial", "sports"], author: "Jovanny Lemonad", package: "russo-one" },
  { id: "source-sans-3", family: "Source Sans 3", role: "body", moods: ["neutral", "cozy"], author: "Paul D. Hunt", package: "source-sans-3" },
  { id: "saira-stencil-one", family: "Saira Stencil One", role: "display", moods: ["industrial", "military"], author: "Omnibus-Type", package: "saira-stencil-one" },
  { id: "barlow-condensed", family: "Barlow Condensed", role: "body", moods: ["industrial", "sports"], author: "Jeremy Tribby", package: "barlow-condensed" },
  { id: "lilita-one", family: "Lilita One", role: "display", moods: ["cozy"], author: "Juan Montoreano", package: "lilita-one" },
  { id: "im-fell-english-sc", family: "IM Fell English SC", role: "display", moods: ["fantasy", "historical"], author: "Igino Marini", package: "im-fell-english-sc" },
  { id: "alegreya", family: "Alegreya", role: "body", moods: ["fantasy", "historical", "cozy"], author: "Juan Pablo del Peral", package: "alegreya" },
  { id: "inter", family: "Inter", role: "body", moods: ["neutral", "industrial"], author: "Rasmus Andersson", package: "inter" },
] as const satisfies readonly FontEntry[];

/** The id of one family in {@link FONT_LIBRARY}. */
export type FontId = (typeof FONT_LIBRARY)[number]["id"];

/** Licence of every shipped family. */
export const FONT_LICENSE = "OFL-1.1";

/** The Fontsource release every file is taken from. */
export const FONT_PACKAGE_VERSION = "5.3.0";

/** Where a game serves fonts from, relative to `public/`. */
export const FONT_DIR = "fonts";

/** The curated family for `id`; throws naming the known ids. */
/** @internal */
export function fontOf(id: string): FontEntry {
  const entry = FONT_LIBRARY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown font "${id}"; known: ${FONT_LIBRARY.map((candidate) => candidate.id).join(", ")}`);
  return entry;
}

/** Path of a family under {@link FONT_DIR}, one folder per id: `oswald/oswald.woff2`. */
/** @internal */
export function fontFileName(id: string): string {
  const { id: known } = fontOf(id);
  return `${known}/${known}.woff2`;
}

/** Path of the woff2 inside the Fontsource npm tarball. */
/** @internal */
export function fontOriginPath(id: string): string {
  return `package/files/${fontOf(id).package}-latin-400-normal.woff2`;
}

/** The npm registry tarball the family's file is extracted from. */
/** @internal */
export function fontOriginUrl(id: string): string {
  const { package: name } = fontOf(id);
  return `https://registry.npmjs.org/@fontsource/${name}/-/${name}-${FONT_PACKAGE_VERSION}.tgz`;
}

/** One family as the face {@link useGameFonts} loads. */
/** @internal */
export function libraryFont(id: FontId, baseUrl = `/${FONT_DIR}`): GameFontFace {
  return { family: fontOf(id).family, src: `${baseUrl}/${fontFileName(id)}`, weight: 400 };
}

/**
 * A display and a body family by id as the pairing a game's HUD kit and menus take:
 * `const FONTS = libraryFontPairing("oswald", "barlow"); useGameFonts(FONTS); gameFontStacks(FONTS)`.
 * Throws on an unknown id or a family used in the wrong role.
 *
 * @capability font-library pick a display and a body font from the shipped OFL families by id
 */
export function libraryFontPairing(display: FontId, body: FontId, numeric?: FontId, baseUrl?: string): GameFontPairing {
  if (fontOf(display).role === "body") throw new Error(`font "${display}" is a body face; pass it as the body`);
  if (fontOf(body).role === "display") throw new Error(`font "${body}" is a display face; pass it as the display`);
  return { display: libraryFont(display, baseUrl), body: libraryFont(body, baseUrl), ...(numeric === undefined ? {} : { numeric: libraryFont(numeric, baseUrl) }) };
}
