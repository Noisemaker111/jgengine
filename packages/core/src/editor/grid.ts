import type { EditorVec3 } from "./types";

/**
 * How a grid layer's columns and rows map onto world axes.
 * - `"xz"` (default): columns advance +X, rows advance +Z — a top-down floor plan / board.
 * - `"xy"`: columns advance +X, rows advance +Y — a vertical slice / side-view board.
 * @capability editor-grids Choose how grid columns/rows project onto world axes.
 */
export type EditorGridAxes = "xz" | "xy";

/**
 * One selectable value in a grid layer's palette: the cell value id plus how it reads (label,
 * color) and how ASCII import/export maps it (`glyph`). Games register these so the editor and
 * the import adapters share one legend. `meta` carries the typed payload (cost, damage, tags, …)
 * a runtime attaches to every cell holding this value.
 * @capability editor-grids Register a cell value's legend, glyph, color, and typed payload.
 */
export interface EditorGridPaletteEntry {
  id: string;
  label?: string;
  /** Single character this value maps to for ASCII/glyph import/export. */
  glyph?: string;
  color?: string;
  meta?: Record<string, unknown>;
}

/**
 * A sparse, editor-owned tile grid serialized on the scene document. Only non-empty cells are
 * stored (a `col,row` → value-id map), so a mostly empty grid stays small no matter how large its
 * declared `cols`/`rows` bounds are. `kind` names the game schema the cells belong to (`room`,
 * `tactics`, `nav`, `farm`, …); `palette` carries the typed cell payloads by value id; `empty`
 * is the value id treated as background (cells holding it are dropped from `cells`). Runtime and
 * rendering both read the same layer through the query helpers in this module — renderers are
 * registered adapters over this data, never baked into it.
 * @capability editor-grids Serialize grid-addressed tile content on the scene document.
 */
export interface EditorGridLayer {
  id: string;
  kind: string;
  label?: string;
  /** World position of cell (0, 0)'s center; `cellSize` and `axes` place every other cell. */
  origin: EditorVec3;
  /** Column/row → world-axis mapping; defaults to `"xz"` when absent. */
  axes?: EditorGridAxes;
  /** World size of one cell along both grid axes. */
  cellSize: number;
  cols: number;
  rows: number;
  /** Value id treated as empty/background; cells holding it are omitted from `cells`. Default `""`. */
  empty?: string;
  /** Sparse cells keyed `"col,row"` → palette value id. Only non-empty, in-bounds cells appear. */
  cells: Record<string, string>;
  palette?: EditorGridPaletteEntry[];
  visible?: boolean;
  /** Id of the object this layer is parented under (mirrors marker/volume/path parenting). */
  parentId?: string;
  meta?: Record<string, unknown>;
  /** Cell-semantics schema version; {@link migrateGridLayer} normalizes older layers forward. */
  schemaVersion?: number;
}

/** One resolved cell of a grid layer — its column, row, and value id. */
export interface EditorGridCell {
  col: number;
  row: number;
  value: string;
}

/** A single paint/erase edit: set cell `col,row` to `value` (the layer's empty value erases it). */
export interface EditorGridCellEdit {
  col: number;
  row: number;
  value: string;
}

/** The grid-layer cell-schema version this build writes and migrates toward. */
export const CURRENT_GRID_SCHEMA_VERSION = 1;

/**
 * The value id a layer treats as empty/background (default `""`). Cells holding this value are
 * never stored, so it is what {@link getGridCell} returns for any unset cell.
 * @capability editor-grids Resolve a grid layer's empty/background value id.
 */
export function gridEmptyValue(layer: EditorGridLayer): string {
  return layer.empty ?? "";
}

/** Builds the sparse-map key for a cell. @internal */
export function gridCellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Parses a `"col,row"` sparse-map key back into integer coordinates, or `null` when malformed.
 * @capability editor-grids Decode a grid layer's sparse cell key.
 */
export function parseGridCellKey(key: string): { col: number; row: number } | null {
  const comma = key.indexOf(",");
  if (comma <= 0) return null;
  const col = Number.parseInt(key.slice(0, comma), 10);
  const row = Number.parseInt(key.slice(comma + 1), 10);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { col, row };
}

/**
 * True when `col,row` falls inside the layer's declared bounds.
 * @capability editor-grids Bounds-check a grid coordinate before reading or writing it.
 */
export function inGridBounds(layer: EditorGridLayer, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < layer.cols && row < layer.rows;
}

/**
 * Reads the value id at `col,row`, returning the layer's empty value for any unset or
 * out-of-bounds cell. The one read path both gameplay and rendering share.
 * @capability editor-grids Read a grid cell's value id.
 */
export function getGridCell(layer: EditorGridLayer, col: number, row: number): string {
  if (!inGridBounds(layer, col, row)) return gridEmptyValue(layer);
  return layer.cells[gridCellKey(col, row)] ?? gridEmptyValue(layer);
}

/**
 * Samples the value id at `col,row` — the eyedropper. Identical to {@link getGridCell}, named for
 * the authoring op that picks up a cell's value to paint with.
 * @capability editor-grids Eyedrop (sample) a grid cell's value for painting.
 */
export function eyedropGridCell(layer: EditorGridLayer, col: number, row: number): string {
  return getGridCell(layer, col, row);
}

/**
 * Returns a copy of the layer with `col,row` set to `value`, dropping the cell when `value` is the
 * empty value (that is the erase op). Out-of-bounds writes and no-op writes return the layer
 * unchanged, so callers can diff by identity.
 * @capability editor-grids Paint or erase a single grid cell (immutable).
 */
export function setGridCell(
  layer: EditorGridLayer,
  col: number,
  row: number,
  value: string,
): EditorGridLayer {
  if (!inGridBounds(layer, col, row)) return layer;
  const empty = gridEmptyValue(layer);
  const key = gridCellKey(col, row);
  const cells = { ...layer.cells };
  if (value === empty) {
    if (!(key in cells)) return layer;
    delete cells[key];
  } else {
    if (cells[key] === value) return layer;
    cells[key] = value;
  }
  return { ...layer, cells };
}

/**
 * Erases `col,row` back to the layer's empty value — {@link setGridCell} with the empty value.
 * @capability editor-grids Erase a single grid cell (immutable).
 */
export function eraseGridCell(layer: EditorGridLayer, col: number, row: number): EditorGridLayer {
  return setGridCell(layer, col, row, gridEmptyValue(layer));
}

/**
 * Applies a batch of cell edits in one pass, returning the same layer when nothing changed. The
 * op the editor uses for a drag stroke, a paste, or any multi-cell paint/erase.
 * @capability editor-grids Paint or erase many grid cells in one immutable update.
 */
export function paintGridCells(
  layer: EditorGridLayer,
  edits: readonly EditorGridCellEdit[],
): EditorGridLayer {
  const empty = gridEmptyValue(layer);
  const cells = { ...layer.cells };
  let changed = false;
  for (const edit of edits) {
    if (!inGridBounds(layer, edit.col, edit.row)) continue;
    const key = gridCellKey(edit.col, edit.row);
    if (edit.value === empty) {
      if (key in cells) {
        delete cells[key];
        changed = true;
      }
    } else if (cells[key] !== edit.value) {
      cells[key] = edit.value;
      changed = true;
    }
  }
  return changed ? { ...layer, cells } : layer;
}

/**
 * Fills the inclusive rectangle spanning the two corners with `value` (the rectangle tool). Corners
 * may be given in any order; the clamped in-bounds portion is painted.
 * @capability editor-grids Fill a grid rectangle with one value (immutable).
 */
export function fillGridRect(
  layer: EditorGridLayer,
  col0: number,
  row0: number,
  col1: number,
  row1: number,
  value: string,
): EditorGridLayer {
  const cLo = Math.max(0, Math.min(col0, col1));
  const cHi = Math.min(layer.cols - 1, Math.max(col0, col1));
  const rLo = Math.max(0, Math.min(row0, row1));
  const rHi = Math.min(layer.rows - 1, Math.max(row0, row1));
  const edits: EditorGridCellEdit[] = [];
  for (let row = rLo; row <= rHi; row += 1) {
    for (let col = cLo; col <= cHi; col += 1) edits.push({ col, row, value });
  }
  return paintGridCells(layer, edits);
}

/**
 * Flood-fills the 4-connected region of cells sharing the seed cell's value, replacing it with
 * `value` (the bucket tool). Bounded by the layer's declared bounds, so it never scans the world.
 * @capability editor-grids Bucket flood-fill a contiguous grid region (immutable).
 */
export function floodFillGrid(
  layer: EditorGridLayer,
  col: number,
  row: number,
  value: string,
): EditorGridLayer {
  if (!inGridBounds(layer, col, row)) return layer;
  const target = getGridCell(layer, col, row);
  if (target === value) return layer;
  const edits: EditorGridCellEdit[] = [];
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[col, row]];
  while (stack.length > 0) {
    const [c, r] = stack.pop()!;
    if (!inGridBounds(layer, c, r)) continue;
    const key = gridCellKey(c, r);
    if (seen.has(key)) continue;
    seen.add(key);
    if (getGridCell(layer, c, r) !== target) continue;
    edits.push({ col: c, row: r, value });
    stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return paintGridCells(layer, edits);
}

/**
 * Resizes the layer's bounds to `cols`×`rows`, dropping any cells that fall outside the new extent
 * (values are anchored at the origin corner). Negative or fractional sizes are floored to `≥ 0`.
 * @capability editor-grids Resize a grid layer's bounds, trimming out-of-range cells (immutable).
 */
export function resizeGridLayer(layer: EditorGridLayer, cols: number, rows: number): EditorGridLayer {
  const nextCols = Math.max(0, Math.floor(cols));
  const nextRows = Math.max(0, Math.floor(rows));
  if (nextCols === layer.cols && nextRows === layer.rows) return layer;
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(layer.cells)) {
    const parsed = parseGridCellKey(key);
    if (parsed !== null && parsed.col < nextCols && parsed.row < nextRows) cells[key] = value;
  }
  return { ...layer, cols: nextCols, rows: nextRows, cells };
}

/**
 * Every non-empty, in-bounds cell of a layer, sorted row-major (rendering-independent iteration).
 * @capability editor-grids Iterate a grid layer's non-empty cells, row-major.
 */
export function gridCellEntries(layer: EditorGridLayer): EditorGridCell[] {
  const out: EditorGridCell[] = [];
  for (const [key, value] of Object.entries(layer.cells)) {
    const parsed = parseGridCellKey(key);
    if (parsed === null || !inGridBounds(layer, parsed.col, parsed.row)) continue;
    out.push({ col: parsed.col, row: parsed.row, value });
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}

/**
 * Visits every non-empty cell of a layer row-major. Allocation-light convenience over
 * {@link gridCellEntries} for runtime scans that only need a callback.
 * @capability editor-grids Walk a grid layer's non-empty cells with a callback.
 */
export function forEachGridCell(layer: EditorGridLayer, visit: (cell: EditorGridCell) => void): void {
  for (const cell of gridCellEntries(layer)) visit(cell);
}

/**
 * Counts the non-empty, in-bounds cells of a layer.
 * @capability editor-grids Count a grid layer's non-empty cells.
 */
export function gridCellCount(layer: EditorGridLayer): number {
  let count = 0;
  for (const [key, value] of Object.entries(layer.cells)) {
    if (value === gridEmptyValue(layer)) continue;
    const parsed = parseGridCellKey(key);
    if (parsed !== null && inGridBounds(layer, parsed.col, parsed.row)) count += 1;
  }
  return count;
}

/**
 * Every in-bounds cell holding `value`, sorted row-major — the query gameplay uses to find all
 * spawns, hazards, gates, etc. of one kind without touching a renderer.
 * @capability editor-grids Query all grid cells holding a given value.
 */
export function gridCellsOfValue(layer: EditorGridLayer, value: string): EditorGridCell[] {
  return gridCellEntries(layer).filter((cell) => cell.value === value);
}

/**
 * World-space center of cell `col,row`, honoring the layer's origin, cell size, and axis mapping.
 * The shared cell→world map for both placement and rendering.
 * @capability editor-grids Map a grid cell to its world-space center.
 */
export function gridCellToWorld(layer: EditorGridLayer, col: number, row: number): EditorVec3 {
  const primary = col * layer.cellSize;
  const secondary = row * layer.cellSize;
  if ((layer.axes ?? "xz") === "xy") {
    return { x: layer.origin.x + primary, y: layer.origin.y + secondary, z: layer.origin.z };
  }
  return { x: layer.origin.x + primary, y: layer.origin.y, z: layer.origin.z + secondary };
}

/**
 * Inverse of {@link gridCellToWorld}: the nearest cell to a world point (may be out of bounds).
 * The shared world→cell map runtime uses to answer "which cell is the player standing on".
 * @capability editor-grids Map a world-space point to its nearest grid cell.
 */
export function worldToGridCell(
  layer: EditorGridLayer,
  x: number,
  y: number,
  z: number,
): { col: number; row: number } {
  const col = Math.round((x - layer.origin.x) / layer.cellSize);
  if ((layer.axes ?? "xz") === "xy") {
    return { col, row: Math.round((y - layer.origin.y) / layer.cellSize) };
  }
  return { col, row: Math.round((z - layer.origin.z) / layer.cellSize) };
}

/**
 * The value id at the grid cell nearest a world point — {@link worldToGridCell} then
 * {@link getGridCell}. Answers "what tile is here" straight from a world position.
 * @capability editor-grids Read the grid value at a world-space point.
 */
export function getGridCellAtWorld(layer: EditorGridLayer, x: number, y: number, z: number): string {
  const { col, row } = worldToGridCell(layer, x, y, z);
  return getGridCell(layer, col, row);
}

/**
 * Looks up a palette entry by value id.
 * @capability editor-grids Find a grid palette entry by value id.
 */
export function findGridPaletteEntry(
  layer: EditorGridLayer,
  value: string,
): EditorGridPaletteEntry | undefined {
  return layer.palette?.find((entry) => entry.id === value);
}

/**
 * Builds the value-id → glyph map from a layer's palette, for ASCII/glyph export.
 * @capability editor-grids Derive a value→glyph legend from a grid layer's palette.
 */
export function gridGlyphMap(layer: EditorGridLayer): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of layer.palette ?? []) {
    if (entry.glyph !== undefined) map[entry.id] = entry.glyph;
  }
  return map;
}

/** Fields accepted when constructing a grid layer; sensible defaults fill the rest. */
export interface CreateGridLayerInit {
  id: string;
  kind: string;
  cols: number;
  rows: number;
  label?: string;
  cellSize?: number;
  origin?: EditorVec3;
  axes?: EditorGridAxes;
  empty?: string;
  cells?: Record<string, string>;
  palette?: readonly EditorGridPaletteEntry[];
  visible?: boolean;
  meta?: Record<string, unknown>;
}

/**
 * Creates a grid layer from a partial init, defaulting cell size to `1`, origin to the world
 * origin, and axes to `"xz"`. Runs the result through {@link migrateGridLayer} so it is normalized
 * and bounds-clean.
 * @capability editor-grids Create a normalized, empty grid layer to author into.
 */
export function createGridLayer(init: CreateGridLayerInit): EditorGridLayer {
  return migrateGridLayer({
    id: init.id,
    kind: init.kind,
    ...(init.label === undefined ? {} : { label: init.label }),
    origin: init.origin ?? { x: 0, y: 0, z: 0 },
    ...(init.axes === undefined ? {} : { axes: init.axes }),
    cellSize: init.cellSize ?? 1,
    cols: init.cols,
    rows: init.rows,
    ...(init.empty === undefined ? {} : { empty: init.empty }),
    cells: init.cells ?? {},
    ...(init.palette === undefined ? {} : { palette: init.palette.map((entry) => ({ ...entry })) }),
    ...(init.visible === undefined ? {} : { visible: init.visible }),
    ...(init.meta === undefined ? {} : { meta: { ...init.meta } }),
  });
}

/**
 * Normalizes a grid layer forward to the current cell-schema version: clamps `cols`/`rows` to
 * non-negative integers, drops out-of-bounds and empty-valued cells, and stamps `schemaVersion`.
 * The single migration seam every loader and authoring op funnels new/old layers through, so a
 * layer from an older document or an import adapter always lands in a valid, minimal shape.
 * @capability editor-grids Migrate/normalize a grid layer to the current cell schema.
 */
export function migrateGridLayer(layer: EditorGridLayer): EditorGridLayer {
  const cols = Math.max(0, Math.floor(layer.cols));
  const rows = Math.max(0, Math.floor(layer.rows));
  const empty = layer.empty ?? "";
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(layer.cells)) {
    if (value === empty) continue;
    const parsed = parseGridCellKey(key);
    if (parsed === null || parsed.col < 0 || parsed.row < 0 || parsed.col >= cols || parsed.row >= rows) {
      continue;
    }
    cells[gridCellKey(parsed.col, parsed.row)] = value;
  }
  return {
    id: layer.id,
    kind: layer.kind,
    ...(layer.label === undefined ? {} : { label: layer.label }),
    origin: { x: layer.origin.x, y: layer.origin.y, z: layer.origin.z },
    ...(layer.axes === undefined ? {} : { axes: layer.axes }),
    cellSize: layer.cellSize,
    cols,
    rows,
    ...(empty === "" ? {} : { empty }),
    cells,
    ...(layer.palette === undefined ? {} : { palette: layer.palette.map((entry) => ({ ...entry })) }),
    ...(layer.visible === undefined ? {} : { visible: layer.visible }),
    ...(layer.parentId === undefined ? {} : { parentId: layer.parentId }),
    ...(layer.meta === undefined ? {} : { meta: { ...layer.meta } }),
    schemaVersion: CURRENT_GRID_SCHEMA_VERSION,
  };
}

/**
 * Deep-clones a grid layer so authoring edits and history snapshots never alias source cells.
 * @capability editor-grids Deep-clone a grid layer.
 */
export function cloneGridLayer(layer: EditorGridLayer): EditorGridLayer {
  return {
    id: layer.id,
    kind: layer.kind,
    ...(layer.label === undefined ? {} : { label: layer.label }),
    origin: { ...layer.origin },
    ...(layer.axes === undefined ? {} : { axes: layer.axes }),
    cellSize: layer.cellSize,
    cols: layer.cols,
    rows: layer.rows,
    ...(layer.empty === undefined ? {} : { empty: layer.empty }),
    cells: { ...layer.cells },
    ...(layer.palette === undefined
      ? {}
      : {
          palette: layer.palette.map((entry) => ({
            ...entry,
            ...(entry.meta === undefined ? {} : { meta: { ...entry.meta } }),
          })),
        }),
    ...(layer.visible === undefined ? {} : { visible: layer.visible }),
    ...(layer.parentId === undefined ? {} : { parentId: layer.parentId }),
    ...(layer.meta === undefined ? {} : { meta: { ...layer.meta } }),
    ...(layer.schemaVersion === undefined ? {} : { schemaVersion: layer.schemaVersion }),
  };
}
