import type { GameFontFace, GameFontPairing } from "@jgengine/core/ui/fonts.view";

import { FONT_LIBRARY } from "./fonts/index";

export type FontRole = "display" | "body" | "both";

export interface FontEntry {
  id: string;
  family: string;
  role: FontRole;
  moods: readonly string[];
  author: string;
  package: string;
}

export { FONT_LIBRARY };

export type FontId = (typeof FONT_LIBRARY)[number]["id"];

export const FONT_LICENSE = "OFL-1.1";

export const FONT_PACKAGE_VERSION = "5.3.0";

export const FONT_DIR = "fonts";

/** @internal */
export function fontOf(id: string): FontEntry {
  const entry = FONT_LIBRARY.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown font "${id}"; known: ${FONT_LIBRARY.map((candidate) => candidate.id).join(", ")}`);
  return entry;
}

/** @internal */
export function fontFileName(id: string): string {
  const { id: known } = fontOf(id);
  return `${known}/${known}.woff2`;
}

/** @internal */
export function fontOriginPath(id: string): string {
  return `package/files/${fontOf(id).package}-latin-400-normal.woff2`;
}

/** @internal */
export function fontOriginUrl(id: string): string {
  const { package: name } = fontOf(id);
  return `https://registry.npmjs.org/@fontsource/${name}/-/${name}-${FONT_PACKAGE_VERSION}.tgz`;
}

/** @internal */
export function libraryFont(id: FontId, baseUrl = `/${FONT_DIR}`): GameFontFace {
  return { family: fontOf(id).family, src: `${baseUrl}/${fontFileName(id)}`, weight: 400 };
}

/** @capability font-library pick a display and a body font from the shipped OFL families by id */
export function libraryFontPairing(display: FontId, body: FontId, numeric?: FontId, baseUrl?: string): GameFontPairing {
  if (fontOf(display).role === "body") throw new Error(`font "${display}" is a body face; pass it as the body`);
  if (fontOf(body).role === "display") throw new Error(`font "${body}" is a display face; pass it as the display`);
  return { display: libraryFont(display, baseUrl), body: libraryFont(body, baseUrl), ...(numeric === undefined ? {} : { numeric: libraryFont(numeric, baseUrl) }) };
}
