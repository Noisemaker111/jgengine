import type { BillType } from "./events";

/**
 * Line-art watermarks for invoice bill cards (electricity, water, rent) as `RuneGlyph` artwork.
 * Drawn on a 140×72 sheet, scaled and centred into the glyph's 24-unit box.
 */
const S = 'stroke="#b8a898" fill="none" stroke-linecap="round" stroke-linejoin="round"';

const DRAWINGS: Record<BillType, string> = {
  electricity:
    `<path d="M38 8 L28 38 H42 L34 64 L58 30 H44 Z" ${S} stroke-width="2.4"/>`
    + `<rect x="78" y="18" width="44" height="38" rx="2" ${S} stroke-width="2.2"/>`
    + `<rect x="84" y="24" width="32" height="14" rx="1" ${S} stroke-width="1.6"/>`
    + `<path d="M86 50h28M86 56h20" ${S} stroke-width="1.4" opacity=".7"/>`,
  water:
    `<path d="M42 10 C42 10 24 34 24 48 C24 58 32 66 42 66 C52 66 60 58 60 48 C60 34 42 10 42 10Z" ${S} stroke-width="2.4"/>`
    + `<path d="M72 44 H118" ${S} stroke-width="2.6"/>`
    + `<circle cx="98" cy="44" r="12" ${S} stroke-width="2.2"/>`
    + `<circle cx="98" cy="44" r="4" ${S} stroke-width="1.6"/>`
    + `<path d="M98 32v-8M90 36l-6-4M106 36l6-4" ${S} stroke-width="1.6"/>`,
  rent:
    `<rect x="32" y="16" width="34" height="50" ${S} stroke-width="2.2"/>`
    + `<rect x="74" y="16" width="34" height="50" ${S} stroke-width="2.2"/>`
    + `<path d="M36 26h24M36 36h24M36 46h24M78 26h24M78 36h24M78 46h24" ${S} stroke-width="1.3" opacity=".55"/>`,
};

const SCALE = 24 / 140;

export function billCardArtwork(billType: BillType): string {
  return `<g transform="translate(0 ${((24 - 72 * SCALE) / 2).toFixed(2)}) scale(${SCALE.toFixed(4)})">${DRAWINGS[billType]}</g>`;
}
