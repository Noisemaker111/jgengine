import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { EntitySpriteConfig } from "@jgengine/core/game/playableGame";

import { COMPANION_IDS } from "./tuning";

// No GLB models — every prop is a colored primitive or an inline-SVG billboard.
export const assets = createAssetCatalog();

function billboard(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Classic minesweeper number colors.
const NUMBER_COLORS: Record<number, string> = {
  1: "#3b82f6",
  2: "#22c55e",
  3: "#ef4444",
  4: "#6366f1",
  5: "#b45309",
  6: "#14b8a6",
  7: "#e5e7eb",
  8: "#f472b6",
};

function numberSvg(n: number): string {
  const color = NUMBER_COLORS[n] ?? "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <text x="32" y="46" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="900"
    text-anchor="middle" fill="${color}" stroke="#0b0714" stroke-width="3" paint-order="stroke">${n}</text>
</svg>`;
}

const BOMB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g stroke="#0b0714" stroke-width="4" stroke-linecap="round">
    <line x1="32" y1="6" x2="32" y2="58"/><line x1="6" y1="32" x2="58" y2="32"/>
    <line x1="13" y1="13" x2="51" y2="51"/><line x1="51" y1="13" x2="13" y2="51"/>
  </g>
  <circle cx="32" cy="34" r="16" fill="#1f2937" stroke="#0b0714" stroke-width="3"/>
  <circle cx="26" cy="28" r="5" fill="#e5e7eb"/>
  <path d="M40 20 q6 -8 12 -4" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
  <circle cx="53" cy="15" r="4" fill="#f97316"/>
</svg>`;

const FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="28" y="10" width="4" height="46" fill="#0b0714"/>
  <path d="M32 12 L54 20 L32 30 Z" fill="#ef4444" stroke="#0b0714" stroke-width="2"/>
  <rect x="18" y="54" width="28" height="6" rx="3" fill="#111827"/>
</svg>`;

function gnomeSvg(hat: string, coat: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96">
  <ellipse cx="32" cy="90" rx="16" ry="5" fill="#00000055"/>
  <path d="M32 6 L50 40 L14 40 Z" fill="${hat}" stroke="#0b0714" stroke-width="2"/>
  <circle cx="32" cy="48" r="11" fill="#f2d3b0" stroke="#0b0714" stroke-width="2"/>
  <path d="M22 52 q10 12 20 0 q-4 14 -20 6 Z" fill="#f5f5f5" stroke="#0b0714" stroke-width="1.5"/>
  <rect x="19" y="58" width="26" height="30" rx="9" fill="${coat}" stroke="#0b0714" stroke-width="2"/>
  <circle cx="26" cy="46" r="2" fill="#0b0714"/><circle cx="38" cy="46" r="2" fill="#0b0714"/>
</svg>`;
}

export const NUMBER_SPRITE_PREFIX = "num-";
export const BOMB_SPRITE = "bomb-mark";
export const FLAG_SPRITE = "flag-mark";

export const entitySprites: Record<string, EntitySpriteConfig> = {
  [BOMB_SPRITE]: { url: billboard(BOMB_SVG), width: 0.8, height: 0.8, y: 0.55 },
  [FLAG_SPRITE]: { url: billboard(FLAG_SVG), width: 0.7, height: 0.85, y: 0.6 },
  [COMPANION_IDS[0]]: { url: billboard(gnomeSvg("#ef4444", "#2563eb")), width: 0.6, height: 0.9, y: 0.42 },
  [COMPANION_IDS[1]]: { url: billboard(gnomeSvg("#22c55e", "#b45309")), width: 0.6, height: 0.9, y: 0.42 },
};
for (let n = 1; n <= 8; n += 1) {
  entitySprites[`${NUMBER_SPRITE_PREFIX}${n}`] = {
    url: billboard(numberSvg(n)),
    width: 0.62,
    height: 0.62,
    y: 0.5,
  };
}
