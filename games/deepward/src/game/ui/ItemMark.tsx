/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView, RuneGlyph } from "@jgengine/core/ui/rune/primitives.view";
import { ITEMS, type ItemKind } from "../state";

const GLYPHS = {
  wire: '<ellipse cx="32" cy="14" rx="19" ry="8"/><path d="M13 14v32c0 5 9 9 19 9s19-4 19-9V14M13 22c10 9 28 9 38 0M13 30c10 9 28 9 38 0M13 38c10 9 28 9 38 0M28 6v13m8-13v13"/>',
  polymer: '<rect x="9" y="11" width="30" height="30" rx="8"/><rect x="16" y="18" width="16" height="16" rx="4"/><rect x="27" y="27" width="28" height="27" rx="8"/><rect x="34" y="34" width="14" height="13" rx="3"/>',
  cells: '<path d="M18 12h28v44H18zM26 6h12v6M24 21h16M24 45h16m-5-20-9 11h8l-4 7 10-12h-8z"/>',
  ink: '<path d="M20 6h24v11l7 8v31H13V25l7-8zM20 17h24M18 32h28v17H18zM23 11h18M32 34c-8 10-8 13 0 13s8-3 0-13"/>',
  rifle: '<path d="M5 24h38l4 5h12v7H39l-7 8H20l-4-8H5zM20 36l-3 15h10l4-15M43 24v12M48 27v9M35 19v5M12 19v5"/>',
};
export function ItemMark({ kind, size = 32 }: { kind: ItemKind; size?: number }) {
  const glyph = kind === "wire" ? GLYPHS.wire : kind === "polymer" ? GLYPHS.polymer : kind === "cells" ? GLYPHS.cells : kind === "ink" ? GLYPHS.ink : GLYPHS.rifle;
  return <RuneView width={size} height={size} fill="#122528" border={{ width: 1, color: ITEMS[kind].color }} justify="center" items="center">
    <RuneGlyph size={size - 4} color={ITEMS[kind].color} artwork={`<g transform="scale(.375)" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">${glyph}</g>`} />
  </RuneView>;
}
