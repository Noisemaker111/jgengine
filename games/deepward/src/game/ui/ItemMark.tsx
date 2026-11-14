/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView, RuneGlyph } from "@jgengine/core/ui/rune/primitives.view";
import { ITEMS, type Category, type ItemKind } from "../loot";

/** One original line glyph per kind of find, tinted with the item's own colour. */
const BY_CATEGORY: Record<Category, string> = {
  food: '<path d="M14 40c-4-10 4-22 18-24 14-2 22 8 20 18-2 12-14 18-24 17-8 0-12-4-14-11z"/><circle cx="26" cy="32" r="2"/><circle cx="38" cy="28" r="2"/><circle cx="34" cy="40" r="2"/>',
  part: '<circle cx="32" cy="32" r="10"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"/>',
  curio: '<path d="M18 22h28l8 10-22 24L10 32z"/><path d="M10 32h44M26 22l6 34 6-34"/>',
  gear: '<path d="M32 8l20 8v14c0 14-9 22-20 26-11-4-20-12-20-26V16z"/><path d="M24 32l6 6 12-14"/>',
  cap: '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="13"/><path d="M32 6v6M32 52v6M6 32h6M52 32h6M14 14l4 4M46 46l4 4M50 14l-4 4M18 46l-4 4"/>',
};
/** Dark finds (a raisin, a screw) would vanish on the dark tile: lift them toward a readable tone. */
function readable(hex: string): string {
  const n = parseInt(hex.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const light = (0.299 * rgb[0]! + 0.587 * rgb[1]! + 0.114 * rgb[2]!) / 255;
  if (light >= 0.45) return hex;
  const lift = (0.45 - light) / (1 - light);
  return `#${rgb.map(v => Math.round(v + (255 - v) * lift).toString(16).padStart(2, "0")).join("")}`;
}
export function ItemMark({ kind, size = 32 }: { kind: ItemKind; size?: number }) {
  const def = ITEMS[kind], color = readable(def.color);
  return <RuneView width={size} height={size} fill="#1d140e" radius={size / 4} border={{ width: 1, color }} justify="center" items="center">
    <RuneGlyph size={size - 4} color={color} artwork={`<g transform="scale(.375)" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${BY_CATEGORY[def.category]}</g>`} />
  </RuneView>;
}
