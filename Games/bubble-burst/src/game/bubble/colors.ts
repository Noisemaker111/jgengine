export type GlyphKind = "triangle" | "diamond" | "circle" | "ring" | "square" | "star";

export interface ColorDef {
  readonly id: number;
  readonly letter: string;
  readonly name: string;
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  readonly glyph: GlyphKind;
}

export const COLORS: readonly ColorDef[] = [
  { id: 0, letter: "R", name: "Cherry", base: "#ff4d6d", light: "#ffb0be", dark: "#a10e34", glyph: "triangle" },
  { id: 1, letter: "Y", name: "Lemon", base: "#ffd23f", light: "#fff2a8", dark: "#a9760a", glyph: "diamond" },
  { id: 2, letter: "G", name: "Lime", base: "#3ddc84", light: "#aef5cd", dark: "#0b7d43", glyph: "circle" },
  { id: 3, letter: "B", name: "Berry", base: "#4d96ff", light: "#b4d0ff", dark: "#123f9e", glyph: "ring" },
  { id: 4, letter: "O", name: "Tangerine", base: "#ff8c42", light: "#ffcda2", dark: "#a24d0c", glyph: "square" },
  { id: 5, letter: "P", name: "Grape", base: "#b15cff", light: "#e0bcff", dark: "#5f1aa8", glyph: "star" },
];

export const LETTER_TO_ID: Readonly<Record<string, number>> = Object.fromEntries(
  COLORS.map((c) => [c.letter, c.id]),
);

export function colorDef(id: number): ColorDef {
  const found = COLORS[id];
  return found === undefined ? COLORS[0]! : found;
}
