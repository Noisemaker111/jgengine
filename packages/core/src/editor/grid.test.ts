import { describe, expect, test } from "bun:test";

import {
  createEditorSession,
  createEmptyEditorDocument,
  decodeEditorDocument,
  exportEditorDocumentJson,
  importEditorDocumentJson,
  mergeEditorDocuments,
  normalizeEditorLayers,
} from "./index";
import {
  createGridLayer,
  eraseGridCell,
  eyedropGridCell,
  fillGridRect,
  floodFillGrid,
  getGridCell,
  getGridCellAtWorld,
  gridCellCount,
  gridCellEntries,
  gridCellToWorld,
  gridCellsOfValue,
  migrateGridLayer,
  paintGridCells,
  resizeGridLayer,
  setGridCell,
  worldToGridCell,
  type EditorGridLayer,
} from "./grid";
import {
  exportAsciiGrid,
  exportCsvGrid,
  importAsciiGrid,
  importCsvGrid,
} from "./gridAdapters";

const ROOM_PALETTE = [
  { id: "floor", glyph: ".", color: "#334155" },
  { id: "wall", glyph: "#", color: "#0f172a" },
  { id: "spawn", glyph: "S", color: "#22d3ee" },
  { id: "hazard", glyph: "X", color: "#ef4444" },
];

function sampleGrid(): EditorGridLayer {
  return createGridLayer({
    id: "room1",
    kind: "room",
    cols: 4,
    rows: 3,
    palette: ROOM_PALETTE,
    cells: { "0,0": "wall", "1,1": "spawn", "2,2": "hazard" },
  });
}

describe("grid layer ops", () => {
  test("createGridLayer normalizes and stamps schema version", () => {
    const layer = sampleGrid();
    expect(layer.schemaVersion).toBe(1);
    expect(layer.cellSize).toBe(1);
    expect(layer.origin).toEqual({ x: 0, y: 0, z: 0 });
    expect(gridCellCount(layer)).toBe(3);
  });

  test("paint and erase are immutable and sparse", () => {
    const layer = sampleGrid();
    const painted = setGridCell(layer, 3, 0, "wall");
    expect(painted).not.toBe(layer);
    expect(getGridCell(painted, 3, 0)).toBe("wall");
    expect(getGridCell(layer, 3, 0)).toBe(""); // original untouched

    const erased = eraseGridCell(painted, 0, 0);
    expect(getGridCell(erased, 0, 0)).toBe("");
    expect("0,0" in erased.cells).toBe(false); // erase removes the sparse key

    // No-op writes return the same reference.
    expect(setGridCell(layer, 1, 1, "spawn")).toBe(layer);
    expect(setGridCell(layer, 99, 99, "wall")).toBe(layer); // out of bounds
  });

  test("eyedrop samples the value under a cell", () => {
    const layer = sampleGrid();
    expect(eyedropGridCell(layer, 2, 2)).toBe("hazard");
    expect(eyedropGridCell(layer, 3, 2)).toBe("");
  });

  test("fillGridRect clamps to bounds", () => {
    const layer = createGridLayer({ id: "g", kind: "room", cols: 3, rows: 3 });
    const filled = fillGridRect(layer, -1, -1, 10, 0, "wall");
    expect(gridCellCount(filled)).toBe(3);
    expect(getGridCell(filled, 0, 0)).toBe("wall");
    expect(getGridCell(filled, 2, 0)).toBe("wall");
    expect(getGridCell(filled, 0, 1)).toBe("");
  });

  test("floodFillGrid replaces a contiguous region only", () => {
    // Left half floor, right column wall; fill from (0,0) should not cross the wall.
    let layer = createGridLayer({ id: "g", kind: "room", cols: 3, rows: 2, empty: "void" });
    layer = fillGridRect(layer, 0, 0, 2, 1, "floor");
    layer = fillGridRect(layer, 2, 0, 2, 1, "wall");
    const filled = floodFillGrid(layer, 0, 0, "grass");
    expect(getGridCell(filled, 0, 0)).toBe("grass");
    expect(getGridCell(filled, 1, 1)).toBe("grass");
    expect(getGridCell(filled, 2, 0)).toBe("wall"); // wall unchanged
  });

  test("resizeGridLayer trims out-of-range cells", () => {
    const layer = sampleGrid();
    const smaller = resizeGridLayer(layer, 2, 2);
    expect(smaller.cols).toBe(2);
    expect(getGridCell(smaller, 2, 2)).toBe(""); // hazard dropped
    expect(getGridCell(smaller, 1, 1)).toBe("spawn");
  });

  test("cell/world mapping round-trips on both axis conventions", () => {
    const xz = createGridLayer({ id: "g", kind: "room", cols: 5, rows: 5, cellSize: 2, origin: { x: 10, y: 0, z: 20 } });
    const world = gridCellToWorld(xz, 3, 4);
    expect(world).toEqual({ x: 16, y: 0, z: 28 });
    expect(worldToGridCell(xz, world.x, world.y, world.z)).toEqual({ col: 3, row: 4 });

    const xy = createGridLayer({ id: "g2", kind: "board", cols: 5, rows: 5, cellSize: 1, axes: "xy" });
    const w2 = gridCellToWorld(xy, 2, 3);
    expect(w2).toEqual({ x: 2, y: 3, z: 0 });
    expect(getGridCellAtWorld(sampleGrid(), 1, 0, 1)).toBe("spawn");
  });

  test("queries find all cells of a value, row-major", () => {
    const layer = paintGridCells(sampleGrid(), [
      { col: 3, row: 0, value: "wall" },
      { col: 0, row: 2, value: "wall" },
    ]);
    const walls = gridCellsOfValue(layer, "wall").map((c) => `${c.col},${c.row}`);
    expect(walls).toEqual(["0,0", "3,0", "0,2"]);
    expect(gridCellEntries(layer)).toHaveLength(5);
  });

  test("migrateGridLayer drops empty-valued and out-of-bounds cells", () => {
    const raw: EditorGridLayer = {
      id: "g",
      kind: "room",
      origin: { x: 0, y: 0, z: 0 },
      cellSize: 1,
      cols: 2,
      rows: 2,
      empty: "floor",
      cells: { "0,0": "wall", "5,5": "wall", "1,1": "floor" },
    };
    const migrated = migrateGridLayer(raw);
    expect(migrated.cells).toEqual({ "0,0": "wall" });
    expect(migrated.schemaVersion).toBe(1);
  });
});

describe("grid document serialization", () => {
  test("grid layers survive a JSON export/import round-trip", () => {
    const doc = { ...createEmptyEditorDocument(), grids: [sampleGrid()] };
    const json = exportEditorDocumentJson(doc);
    const restored = importEditorDocumentJson(json);
    expect(restored.grids).toHaveLength(1);
    expect(restored.grids?.[0]?.cells).toEqual(sampleGrid().cells);
    expect(restored.grids?.[0]?.palette).toHaveLength(4);
  });

  test("decodeEditorDocument reports malformed grid cells", () => {
    const result = decodeEditorDocument({
      markers: [],
      volumes: [],
      paths: [],
      annotations: [],
      prefabs: [],
      collections: [],
      catalogs: [],
      grids: [{ id: "g", kind: "room", origin: { x: 0, y: 0, z: 0 }, cellSize: 1, cols: 2, rows: 2, cells: { "0,0": 5 } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes("cells"))).toBe(true);
    }
  });

  test("normalize and merge carry grid layers", () => {
    const a = normalizeEditorLayers({ grids: [sampleGrid()] });
    expect(a.grids).toHaveLength(1);
    const b = normalizeEditorLayers({
      grids: [createGridLayer({ id: "room2", kind: "room", cols: 2, rows: 2 })],
    });
    const merged = mergeEditorDocuments(a, b);
    expect(merged.grids).toHaveLength(2);
  });
});

describe("grid authoring session (paint/erase/fill/resize + undo/redo)", () => {
  test("dispatches grid commands with working undo/redo", () => {
    const session = createEditorSession({ ...createEmptyEditorDocument(), grids: [sampleGrid()] });

    session.dispatch({ type: "paintGridCells", id: "room1", cells: [{ col: 3, row: 0, value: "wall" }] });
    expect(getGridCell(session.getState().document.grids![0]!, 3, 0)).toBe("wall");

    session.dispatch({ type: "fillGridRect", id: "room1", col0: 0, row0: 2, col1: 3, row1: 2, value: "floor" });
    session.dispatch({ type: "resizeGridLayer", id: "room1", cols: 2, rows: 2 });
    expect(session.getState().document.grids![0]!.cols).toBe(2);

    session.dispatch({ type: "undo" });
    expect(session.getState().document.grids![0]!.cols).toBe(4);
    session.dispatch({ type: "undo" }); // undo the fill
    session.dispatch({ type: "undo" }); // undo the paint
    expect(getGridCell(session.getState().document.grids![0]!, 3, 0)).toBe("");
    session.dispatch({ type: "redo" });
    expect(getGridCell(session.getState().document.grids![0]!, 3, 0)).toBe("wall");
  });

  test("add and remove grid layers", () => {
    const session = createEditorSession(createEmptyEditorDocument());
    session.dispatch({ type: "addGridLayer", layer: createGridLayer({ id: "nav", kind: "nav", cols: 8, rows: 8 }) });
    expect(session.getState().document.grids).toHaveLength(1);
    session.dispatch({ type: "removeGridLayer", id: "nav" });
    expect(session.getState().document.grids).toHaveLength(0);
  });
});

describe("grid import/export adapters", () => {
  const MAP = ["#####", "#S..#", "#.X.#", "#####"].join("\n");

  test("importAsciiGrid parses a glyph map into sparse cells", () => {
    const layer = importAsciiGrid(MAP, { id: "room", kind: "room", palette: ROOM_PALETTE, empty: "floor" });
    expect(layer.cols).toBe(5);
    expect(layer.rows).toBe(4);
    expect(getGridCell(layer, 1, 1)).toBe("spawn");
    expect(getGridCell(layer, 2, 2)).toBe("hazard");
    expect(getGridCell(layer, 0, 0)).toBe("wall");
    // floor is the empty value, so open cells are not stored.
    expect(getGridCell(layer, 2, 1)).toBe("floor");
  });

  test("ASCII export round-trips through import with the same legend", () => {
    const layer = importAsciiGrid(MAP, { id: "room", kind: "room", palette: ROOM_PALETTE, empty: "floor" });
    const text = exportAsciiGrid(layer, { emptyGlyph: "." });
    expect(text).toBe(MAP);
    const reimported = importAsciiGrid(text, { id: "room", kind: "room", palette: ROOM_PALETTE, empty: "floor" });
    expect(reimported.cells).toEqual(layer.cells);
  });

  test("explicit glyphMap overrides palette glyphs", () => {
    const layer = importAsciiGrid("ab", { id: "g", kind: "t", glyphMap: { a: "alpha", b: "beta" } });
    expect(getGridCell(layer, 0, 0)).toBe("alpha");
    expect(getGridCell(layer, 1, 0)).toBe("beta");
  });

  test("CSV import/export round-trips multi-character value ids", () => {
    const csv = "grass,water,\nrock,,grass";
    const layer = importCsvGrid(csv, { id: "farm", kind: "farm" });
    expect(layer.cols).toBe(3);
    expect(layer.rows).toBe(2);
    expect(getGridCell(layer, 1, 0)).toBe("water");
    expect(getGridCell(layer, 0, 1)).toBe("rock");
    expect(getGridCell(layer, 1, 1)).toBe("");
    const out = exportCsvGrid(layer);
    expect(importCsvGrid(out, { id: "farm", kind: "farm" }).cells).toEqual(layer.cells);
  });
});
