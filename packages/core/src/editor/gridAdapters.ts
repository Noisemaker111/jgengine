import {
  createGridLayer,
  getGridCell,
  gridCellKey,
  gridEmptyValue,
  gridGlyphMap,
  type EditorGridAxes,
  type EditorGridLayer,
  type EditorGridPaletteEntry,
} from "./grid";
import type { EditorVec3 } from "./types";

/**
 * Options for importing an ASCII/glyph map into a grid layer. Provide `glyphMap` (char → value id)
 * or a `palette` whose entries carry `glyph`s (or both — `glyphMap` wins on conflict). Any glyph
 * not mapped, and any short-row padding, resolves to `empty`.
 * @capability editor-grid-import Configure an ASCII/glyph → grid-layer import.
 */
export interface AsciiGridImportOptions {
  id: string;
  kind: string;
  label?: string;
  /** Explicit char → value id map. Merged over glyphs derived from `palette`. */
  glyphMap?: Record<string, string>;
  palette?: readonly EditorGridPaletteEntry[];
  /** Value id for unmapped glyphs and ragged-row padding. Default `""`. */
  empty?: string;
  cellSize?: number;
  origin?: EditorVec3;
  axes?: EditorGridAxes;
  meta?: Record<string, unknown>;
}

function normalizeLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function glyphToValue(options: AsciiGridImportOptions): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of options.palette ?? []) {
    if (entry.glyph !== undefined) map[entry.glyph] = entry.id;
  }
  return { ...map, ...(options.glyphMap ?? {}) };
}

/**
 * Parses an ASCII/glyph map — one row per text line, one char per cell — into a grid layer. Each
 * glyph is resolved to a value id via the palette/`glyphMap`; unmapped glyphs and padding become
 * the empty value, so a mostly-open room stays sparse. The canonical representation is the
 * returned {@link EditorGridLayer}; ASCII is just this import path into it, never the source of
 * truth. Bounds are the row count × longest row.
 * @capability editor-grid-import Import an ASCII/glyph map into a grid layer.
 */
export function importAsciiGrid(text: string, options: AsciiGridImportOptions): EditorGridLayer {
  const lines = normalizeLines(text);
  const rows = lines.length;
  let cols = 0;
  for (const line of lines) cols = Math.max(cols, line.length);
  const map = glyphToValue(options);
  const empty = options.empty ?? "";
  const cells: Record<string, string> = {};
  lines.forEach((line, row) => {
    for (let col = 0; col < line.length; col += 1) {
      const value = map[line[col]!] ?? empty;
      if (value !== empty) cells[gridCellKey(col, row)] = value;
    }
  });
  return createGridLayer({
    id: options.id,
    kind: options.kind,
    ...(options.label === undefined ? {} : { label: options.label }),
    cols,
    rows,
    ...(options.cellSize === undefined ? {} : { cellSize: options.cellSize }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.axes === undefined ? {} : { axes: options.axes }),
    ...(empty === "" ? {} : { empty }),
    cells,
    ...(options.palette === undefined ? {} : { palette: options.palette }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
}

/** Options for rendering a grid layer back out as an ASCII/glyph map. */
export interface AsciiGridExportOptions {
  /** value id → char. Defaults to the layer's palette glyphs. */
  glyphMap?: Record<string, string>;
  /** Char emitted for empty cells. Default `"."`. */
  emptyGlyph?: string;
}

/**
 * Renders a grid layer back to an ASCII/glyph map (rows top to bottom). Value ids map to chars via
 * the layer palette (or an override map); empty cells become `emptyGlyph`. Round-trips with
 * {@link importAsciiGrid} when the glyph legend matches.
 * @capability editor-grid-import Export a grid layer as an ASCII/glyph map.
 */
export function exportAsciiGrid(layer: EditorGridLayer, options: AsciiGridExportOptions = {}): string {
  const glyphMap = options.glyphMap ?? gridGlyphMap(layer);
  const emptyGlyph = options.emptyGlyph ?? ".";
  const empty = gridEmptyValue(layer);
  const lines: string[] = [];
  for (let row = 0; row < layer.rows; row += 1) {
    let line = "";
    for (let col = 0; col < layer.cols; col += 1) {
      const value = getGridCell(layer, col, row);
      line += value === empty ? emptyGlyph : (glyphMap[value] ?? (value.charAt(0) || emptyGlyph));
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Options for importing a CSV grid (one value id per cell). */
export interface CsvGridImportOptions {
  id: string;
  kind: string;
  label?: string;
  /** Field separator. Default `","`. */
  delimiter?: string;
  /** Value id for blank fields and ragged-row padding. Default `""`. */
  empty?: string;
  cellSize?: number;
  origin?: EditorVec3;
  axes?: EditorGridAxes;
  palette?: readonly EditorGridPaletteEntry[];
  meta?: Record<string, unknown>;
}

/**
 * Parses a CSV grid — one row per line, one value id per comma-separated field — into a grid
 * layer. Blank fields become the empty value. Unlike ASCII this carries multi-character value ids
 * directly, so it suits grids whose cell values are names rather than single glyphs.
 * @capability editor-grid-import Import a CSV grid (value id per cell) into a grid layer.
 */
export function importCsvGrid(text: string, options: CsvGridImportOptions): EditorGridLayer {
  const delimiter = options.delimiter ?? ",";
  const empty = options.empty ?? "";
  const lines = normalizeLines(text);
  const rows = lines.length;
  let cols = 0;
  const parsed: string[][] = lines.map((line) => {
    const fields = line.split(delimiter).map((field) => field.trim());
    cols = Math.max(cols, fields.length);
    return fields;
  });
  const cells: Record<string, string> = {};
  parsed.forEach((fields, row) => {
    fields.forEach((value, col) => {
      if (value !== "" && value !== empty) cells[gridCellKey(col, row)] = value;
    });
  });
  return createGridLayer({
    id: options.id,
    kind: options.kind,
    ...(options.label === undefined ? {} : { label: options.label }),
    cols,
    rows,
    ...(options.cellSize === undefined ? {} : { cellSize: options.cellSize }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.axes === undefined ? {} : { axes: options.axes }),
    ...(empty === "" ? {} : { empty }),
    cells,
    ...(options.palette === undefined ? {} : { palette: options.palette }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  });
}

/** Options for exporting a grid layer as CSV. */
export interface CsvGridExportOptions {
  /** Field separator. Default `","`. */
  delimiter?: string;
  /** Text emitted for empty cells. Default `""`. */
  emptyField?: string;
}

/**
 * Renders a grid layer as CSV — one row per line, each cell's value id as a field, empty cells as
 * `emptyField`. Round-trips with {@link importCsvGrid}.
 * @capability editor-grid-import Export a grid layer as CSV.
 */
export function exportCsvGrid(layer: EditorGridLayer, options: CsvGridExportOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const emptyField = options.emptyField ?? "";
  const empty = gridEmptyValue(layer);
  const lines: string[] = [];
  for (let row = 0; row < layer.rows; row += 1) {
    const fields: string[] = [];
    for (let col = 0; col < layer.cols; col += 1) {
      const value = getGridCell(layer, col, row);
      fields.push(value === empty ? emptyField : value);
    }
    lines.push(fields.join(delimiter));
  }
  return lines.join("\n");
}
