import {
  createGridLayer,
  eyedropGridCell,
  gridCellCount,
  importAsciiGrid,
  importCsvGrid,
  type EditorGridLayer,
  type EditorSessionState,
} from "@jgengine/core/editor/index";

import type { EditorBridgeResponse } from "../session";
import type { HandlerTable } from "./context";

/** Compact grid-layer summary returned by the grid RPC verbs — never the full sparse cell map. */
function gridLayerSummary(layer: EditorGridLayer): {
  id: string;
  kind: string;
  label?: string;
  cols: number;
  rows: number;
  cellSize: number;
  cellCount: number;
  visible: boolean;
  paletteIds: string[];
} {
  return {
    id: layer.id,
    kind: layer.kind,
    ...(layer.label === undefined ? {} : { label: layer.label }),
    cols: layer.cols,
    rows: layer.rows,
    cellSize: layer.cellSize,
    cellCount: gridCellCount(layer),
    visible: layer.visible ?? true,
    paletteIds: (layer.palette ?? []).map((entry) => entry.id),
  };
}

/** Runs `fn` with the grid layer in `state`, or short-circuits with an honest not-found response. */
function withGridLayer(
  state: EditorSessionState,
  id: string,
  fn: (layer: EditorGridLayer) => EditorBridgeResponse,
): EditorBridgeResponse {
  const layer = (state.document.grids ?? []).find((entry) => entry.id === id);
  if (layer === undefined) return { ok: false, error: `grid layer not found: ${id}` };
  return fn(layer);
}

/** Grid/tile layer verbs — create, edit, paint, fill, and import. */
export const gridHandlers: Pick<
  HandlerTable,
  | "list_grids"
  | "get_grid_cell"
  | "add_grid_layer"
  | "remove_grid_layer"
  | "set_grid_layer"
  | "paint_grid_cells"
  | "fill_grid_rect"
  | "flood_fill_grid"
  | "resize_grid_layer"
  | "import_grid"
> = {
  list_grids: (ctx) => {
    const grids = ctx.session.getState().document.grids ?? [];
    return { ok: true, result: { grids: grids.map(gridLayerSummary) } };
  },
  get_grid_cell: (ctx, request) =>
    withGridLayer(ctx.session.getState(), request.id, (layer) => ({
      ok: true,
      result: { id: request.id, col: request.col, row: request.row, value: eyedropGridCell(layer, request.col, request.row) },
    })),
  add_grid_layer: (ctx, request) => {
    const layer = createGridLayer({
      id: request.id,
      kind: request.kind,
      cols: request.cols,
      rows: request.rows,
      ...(request.label === undefined ? {} : { label: request.label }),
      ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
      ...(request.origin === undefined ? {} : { origin: request.origin }),
      ...(request.axes === undefined ? {} : { axes: request.axes }),
      ...(request.empty === undefined ? {} : { empty: request.empty }),
      ...(request.palette === undefined ? {} : { palette: request.palette }),
    });
    const { applied } = ctx.dispatchGuarded({ type: "addGridLayer", layer });
    if (!applied) return { ok: false, error: "add_grid_layer rejected: no effect" };
    return { ok: true, result: gridLayerSummary(layer) };
  },
  remove_grid_layer: (ctx, request) => {
    const { applied } = ctx.dispatchGuarded({ type: "removeGridLayer", id: request.id });
    if (!applied) return { ok: false, error: `grid layer not found: ${request.id}` };
    return { ok: true, result: { removed: request.id } };
  },
  set_grid_layer: (ctx, request) => {
    const patch: Partial<Omit<EditorGridLayer, "id" | "cells">> = {};
    if (request.label !== undefined) patch.label = request.label;
    if (request.kind !== undefined) patch.kind = request.kind;
    if (request.visible !== undefined) patch.visible = request.visible;
    if (request.empty !== undefined) patch.empty = request.empty;
    if (request.cellSize !== undefined) patch.cellSize = request.cellSize;
    if (request.origin !== undefined) patch.origin = request.origin;
    if (request.axes !== undefined) patch.axes = request.axes;
    if (request.palette !== undefined) patch.palette = request.palette;
    const { applied, state } = ctx.dispatchGuarded({ type: "setGridLayer", id: request.id, patch });
    if (!applied) return { ok: false, error: `set_grid_layer rejected: no effect (${request.id})` };
    return withGridLayer(state, request.id, (layer) => ({ ok: true, result: gridLayerSummary(layer) }));
  },
  paint_grid_cells: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded({ type: "paintGridCells", id: request.id, cells: request.cells });
    if (!applied) return { ok: false, error: `paint_grid_cells rejected: no effect (${request.id})` };
    return withGridLayer(state, request.id, (layer) => ({ ok: true, result: gridLayerSummary(layer) }));
  },
  fill_grid_rect: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded({
      type: "fillGridRect",
      id: request.id,
      col0: request.col0,
      row0: request.row0,
      col1: request.col1,
      row1: request.row1,
      value: request.value,
    });
    if (!applied) return { ok: false, error: `fill_grid_rect rejected: no effect (${request.id})` };
    return withGridLayer(state, request.id, (layer) => ({ ok: true, result: gridLayerSummary(layer) }));
  },
  flood_fill_grid: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded({
      type: "floodFillGrid",
      id: request.id,
      col: request.col,
      row: request.row,
      value: request.value,
    });
    if (!applied) return { ok: false, error: `flood_fill_grid rejected: no effect (${request.id})` };
    return withGridLayer(state, request.id, (layer) => ({ ok: true, result: gridLayerSummary(layer) }));
  },
  resize_grid_layer: (ctx, request) => {
    const { applied, state } = ctx.dispatchGuarded({ type: "resizeGridLayer", id: request.id, cols: request.cols, rows: request.rows });
    if (!applied) return { ok: false, error: `resize_grid_layer rejected: no effect (${request.id})` };
    return withGridLayer(state, request.id, (layer) => ({ ok: true, result: gridLayerSummary(layer) }));
  },
  import_grid: (ctx, request) => {
    const layer =
      request.format === "csv"
        ? importCsvGrid(request.text, {
            id: request.id,
            kind: request.kind,
            ...(request.empty === undefined ? {} : { empty: request.empty }),
            ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
            ...(request.origin === undefined ? {} : { origin: request.origin }),
            ...(request.palette === undefined ? {} : { palette: request.palette }),
          })
        : importAsciiGrid(request.text, {
            id: request.id,
            kind: request.kind,
            ...(request.empty === undefined ? {} : { empty: request.empty }),
            ...(request.cellSize === undefined ? {} : { cellSize: request.cellSize }),
            ...(request.origin === undefined ? {} : { origin: request.origin }),
            ...(request.glyphMap === undefined ? {} : { glyphMap: request.glyphMap }),
            ...(request.palette === undefined ? {} : { palette: request.palette }),
          });
    const { applied } = ctx.dispatchGuarded({ type: "addGridLayer", layer });
    if (!applied) return { ok: false, error: "import_grid rejected: no effect" };
    return { ok: true, result: gridLayerSummary(layer) };
  },
};
