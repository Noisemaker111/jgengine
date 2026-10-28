/**
 * EXAMPLE GENERATOR ADOPTER — a "Bookcase Studio" (Chiro-Visuals style): dimensions, shelves, board
 * thickness, tint, book density/leaning, seeded randomize. NOT engine code — a self-contained module
 * that registers a parts generator with ONE `registerGenerator` call using only public seam
 * APIs. Placed instances persist `{ assetId, ...params, seed }` and re-resolve at runtime. Copy + swap
 * the schema/`generate` to make any slider-driven prop.
 */
import { defineGenerator, registerGenerator, type GeneratorContext } from "@jgengine/core/generator/generator";
import { defineParamSchema, type ParamsOf } from "@jgengine/core/generator/paramSchema";
import { PARTS_OUTPUT, partsBounds, type GeneratedAsset, type GeneratedPart } from "@jgengine/core/scene/assetGenerator";
import { DEFAULT_FORWARD } from "@jgengine/core/scene/facing";

/** The generator id a catalog entry / placed marker references. */
export const BOOKCASE_GENERATOR_ID = "bookcase";

/** The bookcase slider schema — the editor auto-generates the inspector from this. */
export const BOOKCASE_SCHEMA = defineParamSchema({
  fields: [
    { type: "range", key: "width", label: "width", min: 0.6, max: 3, step: 0.05, default: 1.2, unit: "m", group: "carcass" },
    { type: "range", key: "height", label: "height", min: 0.8, max: 3, step: 0.05, default: 2, unit: "m", group: "carcass" },
    { type: "range", key: "depth", label: "depth", min: 0.2, max: 0.6, step: 0.02, default: 0.3, unit: "m", group: "carcass" },
    { type: "range", key: "shelves", label: "shelves", min: 1, max: 8, step: 1, default: 4, group: "carcass" },
    { type: "range", key: "boardThickness", label: "board", min: 0.02, max: 0.1, step: 0.005, default: 0.04, unit: "m", group: "carcass" },
    { type: "color", key: "tint", label: "wood tint", default: "#7a5230", group: "carcass" },
    { type: "action", key: "randomizeCarcass", label: "randomize carcass", action: "randomize", group: "carcass" },
    { type: "range", key: "bookDensity", label: "book density", min: 0, max: 1, step: 0.02, default: 0.8, group: "books" },
    { type: "range", key: "lean", label: "leaning", min: 0, max: 0.4, step: 0.02, default: 0.12, group: "books" },
    { type: "seed", key: "seed", label: "seed", default: "", group: "books" },
    { type: "action", key: "randomizeBooks", label: "randomize books", action: "randomize", group: "books" },
  ],
  groups: [
    { id: "carcass", label: "Carcass" },
    { id: "books", label: "Books" },
  ],
});

const BOOK_COLORS = ["#8c3b3b", "#3b5a8c", "#3b8c5a", "#8c7a3b", "#5a3b8c", "#8c5a3b", "#2f2f34"];

/** Generate a bookcase's board + book parts from validated params + seed — the seam hook. */
export function generateBookcase(params: ParamsOf<typeof BOOKCASE_SCHEMA>, context: GeneratorContext): GeneratedAsset {
  const { width, height, depth, lean, tint } = params;
  const shelves = Math.round(params.shelves);
  const board = params.boardThickness;
  const density = params.bookDensity;
  const roll = (key: string): number => context.random(key)();

  const parts: GeneratedPart[] = [];
  // Carcass: two sides, top, bottom, back.
  parts.push({ id: "side_l", kind: "board", position: [-(width - board) / 2, height / 2, 0], size: [board, height, depth], color: tint });
  parts.push({ id: "side_r", kind: "board", position: [(width - board) / 2, height / 2, 0], size: [board, height, depth], color: tint });
  parts.push({ id: "top", kind: "board", position: [0, height - board / 2, 0], size: [width, board, depth], color: tint });
  parts.push({ id: "bottom", kind: "board", position: [0, board / 2, 0], size: [width, board, depth], color: tint });
  parts.push({ id: "back", kind: "board", position: [0, height / 2, -depth / 2 + board / 2], size: [width, height, board], color: tint });

  // Shelves + books.
  const inner = width - board * 2;
  const gap = (height - board * (shelves + 1)) / shelves;
  for (let s = 0; s < shelves; s += 1) {
    const shelfY = board + s * (gap + board) + gap + board / 2;
    if (s < shelves - 1) parts.push({ id: `shelf_${s}`, kind: "board", position: [0, shelfY, 0], size: [inner, board, depth], color: tint });
    const baseY = board + s * (gap + board) + board;
    let x = -inner / 2 + 0.02;
    let index = 0;
    while (x < inner / 2 - 0.03) {
      const bookWidth = 0.03 + roll(`${s}:${index}:w`) * 0.04;
      if (roll(`${s}:${index}:present`) < density) {
        const bookHeight = gap * (0.7 + roll(`${s}:${index}:h`) * 0.28);
        const tilt = (roll(`${s}:${index}:tilt`) - 0.5) * 2 * lean;
        parts.push({
          id: `book_${s}_${index}`,
          kind: "book",
          position: [x + bookWidth / 2, baseY + bookHeight / 2, 0],
          size: [bookWidth, bookHeight, depth * 0.82],
          rotationY: tilt,
          color: BOOK_COLORS[Math.floor(roll(`${s}:${index}:c`) * BOOK_COLORS.length)]!,
        });
      }
      x += bookWidth + 0.004;
      index += 1;
    }
  }
  return { parts, bounds: partsBounds(parts), forward: DEFAULT_FORWARD };
}

/** The bookcase parts generator. */
export const BOOKCASE_GENERATOR = defineGenerator({
  id: BOOKCASE_GENERATOR_ID,
  label: "Bookcase",
  output: PARTS_OUTPUT,
  schema: BOOKCASE_SCHEMA,
  generate: generateBookcase,
});

/** Register the bookcase generator asset. One call — no engine edits. */
export function registerBookcaseStudio(): void {
  registerGenerator(BOOKCASE_GENERATOR);
}
